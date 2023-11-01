#!/usr/bin/env bash

# ===> COMMON SECTION START  ===>

# http://bash.cumulonim.biz/NullGlob.html
shopt -s nullglob
# -------------------------------
this_folder="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
if [ -z "$this_folder" ]; then
  this_folder=$(dirname $(readlink -f $0))
fi
parent_folder=$(dirname "$this_folder")
# -------------------------------
debug(){
    local __msg="$1"
    echo " [DEBUG] `date` ... $__msg "
}

info(){
    local __msg="$1"
    echo " [INFO]  `date` ->>> $__msg "
}

warn(){
    local __msg="$1"
    echo " [WARN]  `date` *** $__msg "
}

err(){
    local __msg="$1"
    echo " [ERR]   `date` !!! $__msg "
}
# ---------- CONSTANTS ----------
export FILE_VARIABLES=${FILE_VARIABLES:-".variables"}
export FILE_LOCAL_VARIABLES=${FILE_LOCAL_VARIABLES:-".local_variables"}
export FILE_SECRETS=${FILE_SECRETS:-".secrets"}
export NAME="bashutils"
export INCLUDE_FILE=".${NAME}"
export TAR_NAME="${NAME}.tar.bz2"
# -------------------------------
if [ ! -f "$this_folder/$FILE_VARIABLES" ]; then
  warn "we DON'T have a $FILE_VARIABLES variables file - creating it"
  touch "$this_folder/$FILE_VARIABLES"
else
  . "$this_folder/$FILE_VARIABLES"
fi

if [ ! -f "$this_folder/$FILE_LOCAL_VARIABLES" ]; then
  warn "we DON'T have a $FILE_LOCAL_VARIABLES variables file - creating it"
  touch "$this_folder/$FILE_LOCAL_VARIABLES"
else
  . "$this_folder/$FILE_LOCAL_VARIABLES"
fi

if [ ! -f "$this_folder/$FILE_SECRETS" ]; then
  warn "we DON'T have a $FILE_SECRETS secrets file - creating it"
  touch "$this_folder/$FILE_SECRETS"
else
  . "$this_folder/$FILE_SECRETS"
fi

# ---------- include bashutils ----------
. ${this_folder}/${INCLUDE_FILE}

# ---------- FUNCTIONS ----------

update_bashutils(){
  echo "[update_bashutils] ..."

  tar_file="${NAME}.tar.bz2"
  _pwd=`pwd`
  cd "$this_folder"

  curl -s https://api.github.com/repos/jtviegas/bashutils/releases/latest \
  | grep "browser_download_url.*${NAME}\.tar\.bz2" \
  | cut -d '"' -f 4 | wget -qi -
  tar xjpvf $tar_file
  if [ ! "$?" -eq "0" ] ; then echo "[update_bashutils] could not untar it" && cd "$_pwd" && return 1; fi
  rm $tar_file

  cd "$_pwd"
  echo "[update_bashutils] ...done."
}

# <=== COMMON SECTION END  <===
# -------------------------------------

# =======>    MAIN SECTION    =======>

# ---------- LOCAL CONSTANTS ----------
INFRA_DIR="$this_folder/infrastructure"

# ---------- LOCAL FUNCTIONS ----------

infra_basic()
{
  info "[infra_basic|in] (operation=$1)"

  local operation="$1"

  [ "$operation" != "on" ] && [ "$operation" != "off" ] && usage

  local tf_dir="${INFRA_DIR}/basic"

  _pwd=`pwd`
  cd "$tf_dir"

  if [ "$operation" == "on" ]; then
    # mandatory to use env var AWS_PROFILE (to use a root account) in basic infra setup
    unset AWS_ACCESS_KEY_ID
    unset AWS_SECRET_ACCESS_KEY
    terraform init
    terraform plan
    terraform apply -auto-approve -lock=true -lock-timeout=5m
    if [ "$?" -eq "0" ]; then
      iac_access_key="$(terraform output iac_access_key)"
      iac_access_key_id="$(terraform output iac_access_key_id)"
      add_entry_to_local_variables "AWS_ACCESS_KEY_ID" "${iac_access_key_id}"
      add_entry_to_secrets "AWS_SECRET_ACCESS_KEY" "${iac_access_key}"

      user_access_key="$(terraform output user_access_key)"
      user_access_key_id="$(terraform output user_access_key_id)"
      add_entry_to_local_variables "USER_ACCESS_KEY_ID" "${user_access_key_id}"
      add_entry_to_secrets "USER_SECRET_ACCESS_KEY" "${user_access_key}"

    fi
  elif [ "$operation" == "off" ]; then
    # mandatory to use env var AWS_PROFILE (to use a root account) in basic infra setup
    unset AWS_ACCESS_KEY_ID
    unset AWS_SECRET_ACCESS_KEY
    terraform init
    terraform destroy -lock=true -lock-timeout=5m -auto-approve
    if [ "$?" -eq "0" ]; then
      add_entry_to_local_variables "AWS_ACCESS_KEY_ID"
      add_entry_to_secrets "AWS_SECRET_ACCESS_KEY"
      add_entry_to_local_variables "USER_ACCESS_KEY_ID"
      add_entry_to_secrets "USER_SECRET_ACCESS_KEY"
    fi
  fi
  rm -rf ./terraform
  cd "$_pwd"

  info "[infra_basic|out]"
}

infra()
{
  info "[infra|in] (operation=$1)"

  local operation="$1"
  [ "$operation" != "on" ] && [ "$operation" != "off" ] && usage

  local tf_dir="${INFRA_DIR}"

  _pwd=`pwd`
  cd "$tf_dir"

  if [ "$operation" == "on" ]; then

    terraform init -upgrade -backend-config="bucket=${TF_VAR_bucket}" \
      -backend-config="key=${TFSTATE_MAIN_KEY}" \
      -backend-config="region=${TF_VAR_region}" -backend-config="dynamodb_table=${TF_VAR_tfstate_lock_table}"
    terraform plan
    terraform apply -auto-approve -lock=true -lock-timeout=5m

  elif [ "$operation" == "off" ]; then

    terraform init -upgrade -backend-config="bucket=${TF_VAR_bucket}" \
      -backend-config="key=${TFSTATE_MAIN_KEY}" \
      -backend-config="region=${TF_VAR_region}" -backend-config="dynamodb_table=${TF_VAR_tfstate_lock_table}"
    terraform destroy -lock=true -lock-timeout=5m -auto-approve

  fi
  rm -rf ./terraform
  cd "$_pwd"

  info "[infra|out]"
}


# -------------------------------------
usage() {
  cat <<EOM
  usage:
  $(basename $0) { OPTION }
      options:
      - package                 : tars the bashutils include file
      - update_bashutils        : updates the include '.bashutils' file
      - infra_basic {on|off}    : manages basic infrastructure (iac user and tf remote state)
      - infra {on|off}          : manages main solution infrastructure
EOM
  exit 1
}

debug "1: $1 2: $2 3: $3 4: $4 5: $5 6: $6 7: $7 8: $8 9: $9"

case "$1" in
  package)
    package
    ;;
  update_bashutils)
    update_bashutils
    ;;
  infra_basic)
    infra_basic "$2"
    ;;
  infra)
    infra "$2"
    ;;
  *)
    usage
    ;;
esac