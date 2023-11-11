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

setup_cdk()
{
  info "[setup_cdk|in]"
  which node
  if [ "0" -ne "$?" ]; then
    err "[setup_cdk] have to install node" && return 1
  fi
  sudo npm install -g aws-cdk
  cdk -h
  result=$?
  info "[setup_cdk|out] => $result"
  return $result
}

infra()
{
  info "[infra|in] (operation=$1)"

  local operation="$1"
  local tf_dir="${INFRA_DIR}"

  [ "$operation" != "on" ] && [ "$operation" != "off" ] && usage 

  _pwd=`pwd`
  cd "$tf_dir"

  aws configure --profile "$AWS_PROFILE" set region "$AWS_DEFAULT_REGION"
  aws configure --profile "$AWS_PROFILE" set aws_access_key_id "$AWS_KEY_ID"
  aws configure --profile "$AWS_PROFILE" set aws_secret_access_key "$AWS_KEY"

  if [ "$operation" == "on" ]; then
    cdk synth
    [ "$?" -ne "0" ] && err "[infra] couldn't synth" && cd "$_pwd" && exit 1
    cdk deploy --require-approval=never
    [ "$?" -ne "0" ] && err "[infra] couldn't deploy" && cd "$_pwd" && exit 1
  elif [ "$operation" == "off" ]; then
    cdk destroy --force
    [ "$?" -ne "0" ] && err "[infra] couldn't destroy" && cd "$_pwd" && exit 1
  fi

  cd "$_pwd"
  info "[infra|out]"
}

cdk_bootstrap()
{
  info "[cdk_bootstrap|in]"
  #aws cloudformation delete-stack --stack-name CDKToolkit
  cdk bootstrap
  result=$?
  info "[cdk_bootstrap|out] => $result"
  return $result
}

commands() {
  cat <<EOM

  handy commands:

  cdk init app --language typescript  create new cdk app on typescript
  npm run build                       compile typescript to js
  npm run watch                       watch for changes and compile
  npm run test                        perform the jest unit tests
  cdk deploy                          deploy this stack to your default AWS account/region
  cdk diff                            compare deployed stack with current state
  cdk synth                           emits the synthesized CloudFormation template
  aws cloudformation delete-stack --stack-name CDKToolkit   delete to later recreate with bootstrap (see https://stackoverflow.com/questions/71280758/aws-cdk-bootstrap-itself-broken/71283964#71283964)
  cdk init app --language typescript
EOM
}


# -------------------------------------
usage() {
  cat <<EOM
  usage:
  $(basename $0) { OPTION }
      options:
      - commands              : handy commands
      - package               : tars the bashutils include file
      - update_bashutils      : updates the include '.bashutils' file
      - infra {on|off}        : manages solution infrastructure with cdk
      - setup_cdk             : sets up aws cdk cli and solution dependencies
EOM
  exit 1
}

debug "1: $1 2: $2 3: $3 4: $4 5: $5 6: $6 7: $7 8: $8 9: $9"

info "current aws profile: ${AWS_PROFILE}"

case "$1" in
  commands)
    commands
    ;;
  package)
    package
    ;;
  update_bashutils)
    update_bashutils
    ;;
  infra)
    infra "$2"
    ;;
  setup_cdk)
    setup_cdk
    ;;
  *)
    usage
    ;;
esac