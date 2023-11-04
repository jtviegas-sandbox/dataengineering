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

infra_base()
{
  info "[infra_base|in] (operation=$1)"

  local operation="$1"

  [ "$operation" != "on" ] && [ "$operation" != "off" ] && usage

  local tf_dir="${INFRA_DIR}/base"

  _pwd=`pwd`
  cd "$tf_dir"

  # mandatory to use an AWS_PROFILE with an owner/super root account that should be deleted afterwards
  set AWS_PROFILE="$AWS_DEFAULT_PROFILE"
  unset AWS_ACCESS_KEY_ID
  unset AWS_SECRET_ACCESS_KEY

  if [ "$operation" == "on" ]; then
    terraform init -backend-config="bucket=${TFSTATE_BUCKET}" -backend-config="key=${TFSTATE_KEY}" -backend-config="region=${AWS_DEFAULT_REGION}" -backend-config="dynamodb_table=${TFSTATE_LOCK_TABLE}"
    terraform plan
    terraform apply -auto-approve -lock=true -lock-timeout=5m
    if [ "$?" -eq "0" ]; then
      access_key="$(terraform output access_key)"
      access_key_id="$(terraform output access_key_id)"

      aws configure --profile "$AWS_SOLUTION_PROFILE" set region "$AWS_DEFAULT_REGION"
      aws configure --profile "$AWS_SOLUTION_PROFILE" set aws_access_key_id "$access_key_id"
      aws configure --profile "$AWS_SOLUTION_PROFILE" set aws_secret_access_key "$access_key"
    fi
  elif [ "$operation" == "off" ]; then
    terraform init -backend-config="bucket=${TFSTATE_BUCKET}" -backend-config="key=${TFSTATE_KEY}" -backend-config="region=${AWS_DEFAULT_REGION}" -backend-config="dynamodb_table=${TFSTATE_LOCK_TABLE}"
    terraform destroy -lock=true -lock-timeout=5m -auto-approve
  fi

  rm -rf ./terraform
  cd "$_pwd"

  info "[infra_base|out]"
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
      - infra_base {on|off}    : manages base infrastructure (solution root user)
      - infra {on|off}          : manages main solution infrastructure
EOM
  exit 1
}

debug "1: $1 2: $2 3: $3 4: $4 5: $5 6: $6 7: $7 8: $8 9: $9"

info "current aws profile: ${AWS_PROFILE}"

case "$1" in
  package)
    package
    ;;
  update_bashutils)
    update_bashutils
    ;;
  infra_base)
    infra_base "$2"
    ;;
  infra)
    infra "$2"
    ;;
  *)
    usage
    ;;
esac