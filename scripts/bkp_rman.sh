#!/bin/bash
# =============================================================
# oracle-bkp-rman.sh — Backup Full RMAN + copia pro host (WSL)
#
# Uso:
#   ./oracle-bkp-rman.sh --container <nome>
#
# Exemplo:
#   ./oracle-bkp-rman.sh --container oracle-master
#
# O QUE FAZ:
#   Roda backup full via RMAN dentro do container (datafiles + controlfile)
#   e exporta o PFILE atual da SPFILE, direto em
#   /home/oracle/dumps/bkp_rman/<container> — que via o mount padrao
#   (/opt/dumps:/home/oracle/dumps) ja cai em /opt/dumps/bkp_rman/<container>
#   no host, sem precisar de copia.
# =============================================================

set -euo pipefail

CONTAINER_NAME=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --container) CONTAINER_NAME="$2"; shift 2 ;;
        *)           echo "[ERRO] Flag desconhecida: $1"; exit 1 ;;
    esac
done

[ -z "$CONTAINER_NAME" ] && echo "[ERRO] --container é obrigatório" && exit 1

CONTAINER_DIR="/home/oracle/dumps/bkp_rman/${CONTAINER_NAME}"

echo ">>> Ligando container ${CONTAINER_NAME}..."
docker start "$CONTAINER_NAME"

echo ">>> Aguardando 20 segundos para o Oracle inicializar..."
sleep 20

echo ">>> Limpando backups antigos dentro do container..."
docker exec -u oracle "$CONTAINER_NAME" bash -c "mkdir -p ${CONTAINER_DIR} && rm -f ${CONTAINER_DIR}/*.bkp ${CONTAINER_DIR}/*.ora"

echo ">>> Executando backup full via RMAN..."
docker exec -i -u oracle "$CONTAINER_NAME" bash -c "export ORACLE_HOME=/u01/app/oracle/product/11.2.0/xe; export ORACLE_SID=XE; export PATH=\$ORACLE_HOME/bin:\$PATH; rman target /" <<EOF
SHUTDOWN IMMEDIATE;
STARTUP MOUNT;
RUN {
  ALLOCATE CHANNEL c1 DEVICE TYPE DISK;
  BACKUP DATABASE FORMAT '${CONTAINER_DIR}/db_%U.bkp' TAG 'BACKUP_FULL';
  BACKUP CURRENT CONTROLFILE FORMAT '${CONTAINER_DIR}/controlfile_%U.bkp';
  RELEASE CHANNEL c1;
}
ALTER DATABASE OPEN;
EXIT;
EOF

echo ">>> Exportando PFILE a partir da SPFILE..."
docker exec -i -u oracle "$CONTAINER_NAME" bash -c "export ORACLE_HOME=/u01/app/oracle/product/11.2.0/xe; export ORACLE_SID=XE; export PATH=\$ORACLE_HOME/bin:\$PATH; echo \"CREATE PFILE='${CONTAINER_DIR}/init_clone.ora' FROM SPFILE;\" | sqlplus -S / as sysdba"

echo ">>> Concluido: /opt/dumps/bkp_rman/${CONTAINER_NAME}"
