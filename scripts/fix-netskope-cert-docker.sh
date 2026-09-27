#!/usr/bin/env bash
#
# fix-netskope-cert-docker.sh
#
# Resolve erros de "PKIX path building failed" / "unable to find valid
# certification path" dentro de containers Docker, causados pela inspecao
# de trafego HTTPS do Netskope (agente de seguranca da empresa).
#
# O que o script faz:
#   1. Se ja existir uma copia salva do certificado em ./certs/netskope-totvs-root.crt
#      (persistente, versionavel com o projeto), usa ela.
#   2. Caso contrario, extrai o certificado raiz da Netskope numa conexao
#      HTTPS de teste e salva a copia em ./certs para uso futuro.
#   3. Injeta o certificado no container informado:
#        - copia o arquivo para dentro do container
#        - roda update-ca-certificates (nivel SO)
#        - roda keytool -importcert no cacerts da JVM (nivel Java)
#   4. Reinicia o container para garantir que a JVM releia a truststore.
#
# Uso:
#   chmod +x fix-netskope-cert-docker.sh
#   ./fix-netskope-cert-docker.sh --container <nome_ou_id_do_container>
#
# Exemplo:
#   ./fix-netskope-cert-docker.sh --container winthor-app
#
set -euo pipefail

if [ "${1:-}" != "--container" ] || [ -z "${2:-}" ]; then
    echo "Uso: $0 --container <nome_ou_id_do_container>"
    exit 1
fi
CONTAINER="$2"

CERT_STORE_DIR="./certs"
CERT_STORE_FILE="$CERT_STORE_DIR/netskope-totvs-root.crt"
CERT_DEST_LINUX="/usr/local/share/ca-certificates/netskope-totvs-root.crt"
CERT_DEST_TMP="/tmp/netskope-totvs-root.crt"
EXTRACT_HOST="pdvsync-core-cliente-qa-ywc7q7nxya-uc.a.run.app"

echo "==> Verificando certificado raiz da Netskope..."
if [ -f "$CERT_STORE_FILE" ]; then
    echo "    Copia persistente encontrada em: $CERT_STORE_FILE"
else
    echo "    Nenhuma copia persistente encontrada. Extraindo da conexao HTTPS..."
    TMP_DIR="$(mktemp -d)"
    trap 'rm -rf "$TMP_DIR"' EXIT
    echo | openssl s_client -connect "${EXTRACT_HOST}:443" -showcerts 2>/dev/null \
        | awk -v dir="$TMP_DIR" 'BEGIN{c=0} /BEGIN CERTIFICATE/{c++} {print > dir"/cert"c".pem"}'

    ROOT_CERT=""
    for f in "$TMP_DIR"/cert*.pem; do
        [ -f "$f" ] || continue
        subject="$(openssl x509 -in "$f" -noout -subject 2>/dev/null || true)"
        issuer="$(openssl x509 -in "$f" -noout -issuer 2>/dev/null || true)"
        if [ -n "$subject" ] && [ "${subject#subject=}" = "${issuer#issuer=}" ]; then
            ROOT_CERT="$f"
            break
        fi
    done

    if [ -z "$ROOT_CERT" ]; then
        echo "ERRO: nao foi possivel identificar automaticamente o certificado raiz."
        echo "Rode manualmente: openssl s_client -connect ${EXTRACT_HOST}:443 -showcerts para investigar."
        exit 1
    fi

    mkdir -p "$CERT_STORE_DIR"
    cp "$ROOT_CERT" "$CERT_STORE_FILE"
    echo "    Certificado extraido e salvo permanentemente em: $CERT_STORE_FILE"
    echo "    Dica: versione essa pasta 'certs/' no repositorio para reaproveitar em outras maquinas."
fi

echo "==> Verificando se o container '$CONTAINER' esta em execucao..."
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "ERRO: container '$CONTAINER' nao encontrado ou nao esta em execucao."
    echo "Containers em execucao:"
    docker ps --format '  - {{.Names}}'
    exit 1
fi

echo "==> Copiando certificado para dentro do container..."
docker cp "$CERT_STORE_FILE" "$CONTAINER:$CERT_DEST_TMP"

echo "==> Instalando certificado no repositorio de confianca do Linux (dentro do container)..."
docker exec "$CONTAINER" sh -c "
    cp '$CERT_DEST_TMP' '$CERT_DEST_LINUX' 2>/dev/null || true
    (command -v update-ca-certificates >/dev/null 2>&1 && update-ca-certificates) || \
    echo '    AVISO: update-ca-certificates nao disponivel nesta imagem (ok se for so JVM).'
"

echo "==> Verificando se ha JVM no container, para importar no cacerts..."
JAVA_HOME_DETECTED="$(docker exec "$CONTAINER" sh -c 'echo $JAVA_HOME' 2>/dev/null || true)"
if [ -z "$JAVA_HOME_DETECTED" ]; then
    JAVA_HOME_DETECTED="$(docker exec "$CONTAINER" sh -c "dirname \$(dirname \$(readlink -f \$(command -v java)))" 2>/dev/null || true)"
fi

if [ -n "$JAVA_HOME_DETECTED" ]; then
    echo "    JAVA_HOME detectado: $JAVA_HOME_DETECTED"
    echo "==> Importando certificado na truststore da JVM (cacerts)..."
    docker exec "$CONTAINER" sh -c "
        keytool -importcert -noprompt \
            -alias netskope-totvs \
            -file '$CERT_DEST_TMP' \
            -keystore '$JAVA_HOME_DETECTED/lib/security/cacerts' \
            -storepass changeit \
        || echo '    AVISO: falha ao importar no cacerts (talvez ja exista o alias, ou keytool indisponivel).'
    "
else
    echo "    Nenhuma JVM detectada no container. Pulando etapa do cacerts."
fi

echo "==> Reiniciando o container para garantir releitura da truststore..."
docker restart "$CONTAINER" >/dev/null
echo "    Container reiniciado."

echo "==> Pronto! Certificado da Netskope instalado no container '$CONTAINER'."