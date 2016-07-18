function before_image() {
  local region=$1
  echo ${AccountId}.dkr.ecr.${region}.amazonaws.com/${repo}:${before}
}

function after_image() {
  local region=$1
  local sha=${2:-${after}}
  echo ${AccountId}.dkr.ecr.${region}.amazonaws.com/${repo}:${sha}
}

function login() {
  local region=$1
  eval "$(aws ecr get-login --region ${region})"
}

function ensure_repo() {
  local region=$1
  aws ecr describe-repositories \
    --region ${region} \
    --repository-names ${repo} > /dev/null 2>&1 || create_repo ${region}
}

function create_repo() {
  local region=$1
  aws ecr create-repository --region ${region} --repository-name ${repo} > /dev/null
}

function github_status() {
  local status=$1
  local description=$2

  echo "sending ${status} status to github"

  curl -s \
    --request POST \
    --header "Content-Type: application/json" \
    --data "{\"state\":\"${status}\",\"description\":\"${description}\",\"context\":\"ecs-conex\"}" \
    ${status_url} > /dev/null
}

function parse_message() {
  ref=$(node -e "console.log(${Message}.ref);")
  after=$(node -e "console.log(${Message}.after);")
  before=$(node -e "console.log(${Message}.before);")
  repo=$(node -e "console.log(${Message}.repository.name);")
  owner=$(node -e "console.log(${Message}.repository.owner.name);")
  user=$(node -e "console.log(${Message}.pusher.name);")
  deleted=$(node -e "console.log(${Message}.deleted);")
  status_url="https://api.github.com/repos/${owner}/${repo}/statuses/${after}?access_token=${GithubAccessToken}"
}

function credentials() {
  role=$(curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/) || :
  if [ -z "${role}" ]; then
    return
  fi

  creds=$(curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/${role})
  accessKeyId=$(node -e "console.log(${creds}.AccessKeyId)")
  secretAccessKey=$(node -e "console.log(${creds}.SecretAccessKey)")
  sessionToken=$(node -e "console.log(${creds}.SessionToken)")

  args=""
  if grep -O "ARG AWS_ACCESS_KEY_ID" ./Dockerfile > /dev/null 2>&1; then
    [ -n "${accessKeyId}" ] && args="--build-arg AWS_ACCESS_KEY_ID=${accessKeyId} "
  fi

  if grep -O "ARG AWS_SECRET_ACCESS_KEY" ./Dockerfile > /dev/null 2>&1; then
    [ -n "${secretAccessKey}" ] && args="--build-arg AWS_ACCESS_KEY_ID=${secretAccessKey} "
  fi

  if grep -O "ARG AWS_SESSION_TOKEN" ./Dockerfile > /dev/null 2>&1; then
    [ -n "${sessionToken}" ] && args="--build-arg AWS_ACCESS_KEY_ID=${sessionToken}"
  fi
}
