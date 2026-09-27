#!/bin/bash
# =============================================================
# restore_rman.sh — Restore RMAN em container novo (WSL)
#
# Uso:
#   ./restore_rman.sh --origem <container> --destino <container> --usuario <user> --senha <senha>
#
# Exemplo:
#   ./restore_rman.sh --origem oracle-local --destino oracle-qa --usuario system --senha pcinfo
#
# PRE-REQUISITO: o container --destino ja deve existir (banco vazio),
#   criado antes via oracle_setup.sh --container <destino> --port <porta>.
#   Este script so restaura — nao cria container (mesma responsabilidade
#   unica do import_dump.sh, que tambem assume o banco ja existente).
#
# O QUE FAZ:
#   1. Confere se existe backup de --origem em /opt/dumps/bkp_rman/<origem>
#      (gerado previamente por bkp_rman.sh).
#   2. Restaura o backup de --origem dentro do --destino via RMAN
#      (SPFILE, controlfile, datafiles, recover, open resetlogs) e
#      desbloqueia --usuario com --senha.
#   3. Pos-restore (igual ao import_dump.sh): recompila objetos invalidos
#      e coleta estatisticas do schema --usuario, via / as sysdba.
# =============================================================

set -euo pipefail

ORIGEM=""
DESTINO=""
USUARIO=""
SENHA=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --origem)    ORIGEM="$2";    shift 2 ;;
        --destino)   DESTINO="$2";   shift 2 ;;
        --usuario)   USUARIO="$2";   shift 2 ;;
        --senha)     SENHA="$2";     shift 2 ;;
        *)           echo "[ERRO] Flag desconhecida: $1"; exit 1 ;;
    esac
done

[ -z "$ORIGEM" ]     && echo "[ERRO] --origem é obrigatório"     && exit 1
[ -z "$DESTINO" ]    && echo "[ERRO] --destino é obrigatório"    && exit 1
[ -z "$USUARIO" ]    && echo "[ERRO] --usuario é obrigatório"    && exit 1
[ -z "$SENHA" ]      && echo "[ERRO] --senha é obrigatório"      && exit 1

HOST_BKP_DIR="/opt/dumps/bkp_rman/${ORIGEM}"
CONTAINER_BKP_DIR="/home/oracle/dumps/bkp_rman/${ORIGEM}"

echo "========================================================================"
echo ">>> [1/2] Conferindo backup de origem em ${HOST_BKP_DIR}..."
echo "========================================================================"
if [ ! -f "${HOST_BKP_DIR}/init_clone.ora" ] || ! ls "${HOST_BKP_DIR}"/controlfile_*.bkp >/dev/null 2>&1 || ! ls "${HOST_BKP_DIR}"/db_*.bkp >/dev/null 2>&1; then
  echo "[ERRO] Backup incompleto ou inexistente em ${HOST_BKP_DIR}."
  echo "       Rode bkp_rman.sh --container ${ORIGEM} antes de restaurar."
  exit 1
fi

if ! docker ps -a --format '{{.Names}}' | grep -q "^${DESTINO}$"; then
  echo "[ERRO] Container --destino '${DESTINO}' nao existe."
  echo "       Crie primeiro com: oracle_setup.sh --container ${DESTINO} --port <porta>"
  exit 1
fi

echo ">>> Ligando container ${DESTINO}..."
docker start "$DESTINO"

echo ""
echo "========================================================================"
echo ">>> [2/2] Restaurando backup de ${ORIGEM} dentro de ${DESTINO}..."
echo "========================================================================"

echo ">>> Desligando banco vazio do destino..."
docker exec -i -u oracle "$DESTINO" bash -c "export ORACLE_HOME=/u01/app/oracle/product/11.2.0/xe; export ORACLE_SID=XE; export PATH=\$ORACLE_HOME/bin:\$PATH; sqlplus -S / as sysdba" <<EOF
SHUTDOWN IMMEDIATE;
EXIT;
EOF

echo ">>> Apagando SPFILE original para evitar bloqueio..."
docker exec -u oracle "$DESTINO" bash -c "rm -f /u01/app/oracle/product/11.2.0/xe/dbs/spfileXE.ora"

echo ">>> Importando configuracoes da origem no novo banco..."
docker exec -i -u oracle "$DESTINO" bash -c "export ORACLE_HOME=/u01/app/oracle/product/11.2.0/xe; export ORACLE_SID=XE; export PATH=\$ORACLE_HOME/bin:\$PATH; sqlplus -S / as sysdba" <<EOF
CREATE SPFILE FROM PFILE='${CONTAINER_BKP_DIR}/init_clone.ora';
EXIT;
EOF

echo ">>> Preparando controlfile para restore..."
docker exec -u oracle "$DESTINO" bash -c "rm -f ${CONTAINER_BKP_DIR}/controlfile_restore.bkp"
docker exec -u oracle "$DESTINO" bash -c "cp \$(ls -t ${CONTAINER_BKP_DIR}/controlfile_*.bkp | head -n 1) ${CONTAINER_BKP_DIR}/controlfile_restore.bkp"

echo ""
echo ">>> Restaurando o controlfile..."
docker exec -i -u oracle "$DESTINO" bash -c "export ORACLE_HOME=/u01/app/oracle/product/11.2.0/xe; export ORACLE_SID=XE; export PATH=\$ORACLE_HOME/bin:\$PATH; rman target /" <<EOF
STARTUP NOMOUNT;
RESTORE CONTROLFILE FROM '${CONTAINER_BKP_DIR}/controlfile_restore.bkp';
EXIT;
EOF

echo ""
echo ">>> Restaurando o banco de dados..."
docker exec -i -u oracle "$DESTINO" bash -c "export ORACLE_HOME=/u01/app/oracle/product/11.2.0/xe; export ORACLE_SID=XE; export PATH=\$ORACLE_HOME/bin:\$PATH; rman target /" <<EOF
ALTER DATABASE MOUNT;
CATALOG START WITH '${CONTAINER_BKP_DIR}/' NOPROMPT;
RESTORE DATABASE FORCE;
EXIT;
EOF

echo ""
echo ">>> Limpando redo logs residuais do destino..."
docker exec -u oracle "$DESTINO" bash -c "rm -f /u01/app/oracle/oradata/XE/redo*.log /u01/app/oracle/oradata/XE/temp*.dbf && rm -f ${CONTAINER_BKP_DIR}/controlfile_restore.bkp"

echo ""
echo ">>> Executando RECOVER e validacao..."
docker exec -i -u oracle "$DESTINO" bash -c "export ORACLE_HOME=/u01/app/oracle/product/11.2.0/xe; export ORACLE_SID=XE; export PATH=\$ORACLE_HOME/bin:\$PATH; rman target /" <<EOF
RECOVER DATABASE;
VALIDATE DATABASE;
EXIT;
EOF

echo ""
echo ">>> Abrindo o banco e configurando usuario..."
docker exec -i -u oracle "$DESTINO" bash -c "export ORACLE_HOME=/u01/app/oracle/product/11.2.0/xe; export ORACLE_SID=XE; export PATH=\$ORACLE_HOME/bin:\$PATH; sqlplus -S / as sysdba" <<EOF
ALTER DATABASE OPEN RESETLOGS;
ALTER SYSTEM DISABLE RESTRICTED SESSION;
ALTER USER ${USUARIO} IDENTIFIED BY ${SENHA} ACCOUNT UNLOCK;
EXIT;
EOF

echo ""
echo ">>> Pos-restore: recompilando objetos invalidos e coletando estatisticas de ${USUARIO}..."
docker exec -i -u oracle "$DESTINO" bash -c "export ORACLE_HOME=/u01/app/oracle/product/11.2.0/xe; export ORACLE_SID=XE; export PATH=\$ORACLE_HOME/bin:\$PATH; sqlplus -S / as sysdba" <<EOF
EXEC UTL_RECOMP.recomp_parallel(1, '${USUARIO}');
EXEC DBMS_STATS.GATHER_SCHEMA_STATS(OWNNAME=>'${USUARIO}', ESTIMATE_PERCENT=>10, DEGREE=>1, CASCADE=>TRUE);
EXIT;
EOF

echo ""
echo "========================================================================"
echo ">>> [SUCESSO] Restore concluido. Container ${DESTINO} pronto."
echo "========================================================================"
