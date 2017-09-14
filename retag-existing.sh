MERGE_COMMIT_TAG="merge-commit"
COMMIT_TAG="commit"
TAG_TAG="tag"
CUSTOM_TAG="custom"
regions=(us-east-1 eu-west-1 us-west-2)
# regions=(us-west-2)

for region in "${regions[@]}"; do
    desc_repo_file="${region}-desc-repositories.json"
    repo_names_file="${region}-repositories.txt"
    # Get all the repositories. Since this script is a one-time thing, and we
    # know that there are < 160 images in all three regions, get 200 items at
    # a time
    aws ecr describe-repositories --max-items 200 --output json --region ${region} > ${desc_repo_file}
    less ${desc_repo_file} | jq -r ' .repositories[] | .repositoryName' | sort | uniq > "${repo_names_file}"
    for repo in `cat "${repo_names_file}"`; do
        # repo="water-bill"
        # Clone the repo
        git clone "git@github.com:mapbox/${repo}.git" "${repo}"
        # Get all git tags
        git --git-dir=./${repo}/.git tag > ${repo}-tags.txt
        # Get all existing image tags
        aws ecr describe-images --repository-name ${repo} --region ${region} --output json | jq -r ' .imageDetails[].imageTags | select( length > 0) | join("\n")' > ${repo}-image-tags.txt
        # Retag an image with "cleanup" or "save" based on whether it's a
        # merge commit/not a sha-commit and if it's a sha-commit respectively
        for sha in `cat ${repo}-image-tags.txt`; do
            # Use the retagging logic as specified on http://docs.aws.amazon.com/AmazonECR/latest/userguide/retag-aws-cli.html
            aws ecr batch-get-image --repository-name ${repo} --region ${region} --image-ids imageTag=${sha} --query images[].imageManifest --output text > ${sha}.manifest
            perl -pe 'chomp if eof' ${sha}.manifest > ${sha}-fixed.manifest

            if [[ `git --git-dir=./${repo}/.git cat-file -p ${sha} 2> /dev/null| grep -Ec '^parent [a-z0-9]{40}'` -ge 2 ]];
            then
                # echo "${sha} ${MERGE_COMMIT_TAG}"
                aws ecr put-image --repository-name ${repo} --region ${region} --image-tag ${MERGE_COMMIT_TAG}-${sha} --image-manifest file://${sha}-fixed.manifest > /dev/null
            elif [[ -n `grep ${sha} ${repo}-tags.txt` ]];
            then
                # echo "${sha} ${TAG_TAG}"
                 aws ecr put-image --repository-name ${repo} --region ${region} --image-tag ${TAG_TAG}-${sha} --image-manifest file://${sha}-fixed.manifest > /dev/null
            elif [[ `git --git-dir=./${repo}/.git rev-parse --verify ${sha} 2> /dev/null` == `echo ${sha}` ]];
            then
                # echo "${sha} ${COMMIT_TAG}"
                aws ecr put-image --repository-name ${repo} --region ${region} --image-tag ${COMMIT_TAG}-${sha} --image-manifest file://${sha}-fixed.manifest
            elif [[ ${sha} != 'custom' && ${sha} != 'merge-commit' && ${sha} != 'commit' && ${sha} != 'tag' ]];
            then
                #err on the side of caution
                # echo "${sha} ${CUSTOM_TAG}"
                aws ecr put-image --repository-name ${repo} --region ${region} --image-tag ${CUSTOM_TAG}-${sha} --image-manifest file://${sha}-fixed.manifest > /dev/null
            fi
            sleep 30
        done
        #cleanup
        rm ${repo}-image-tags.txt
        rm ${repo}-tags.txt
        rm *.manifest
        rm *repositories*
        rm -rf ${repo}
    done
done
