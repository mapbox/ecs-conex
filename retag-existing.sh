SAVE_TAG="save"
CLEANUP_TAG="cleanup"
regions=(us-east-1 eu-west-1 us-west-2)
for region in "${regions[@]}"; do
    desc_repo_file="${region}-desc-repositories.json"
    repo_names_file="${region}-repositories.txt"
    # Get all the repositories. Since this script is a one-time thing, and we
    # know that there are < 160 images in all three regions, get 200 items at
    # a time
    aws ecr describe-repositories --max-items 200 --output json --region ${region} > ${desc_repo_file}
    less ${desc_repo_file} | jq ' .repositories[] | .repositoryName' | sort | uniq > $repo_names_file
    for repo in `cat $repo_names_file`; do
        # Clone the repo
        git clone "git@github.com/mapbox/${repo}"
        # Get in
        cd ${repo}
        # Get all the merge commits
        git log --merges --format=format:%H > "${repo}-merge-commits"
        git rev-list --all --remotes > "${repo}-all-commits"
        # Get all the commits that pertain to a tag OR 
        # pertain to a dereferenced tag
        # git show-ref --tags -d | cut -f 1 -d ' ' > "${repo}-tags"
        git tag >> "${repo}-tags"
        # Get each of these tags and check if an image exists for the same tag
        # Add a new tag "SAVE" to each of these images
        aws ecr describe-images --repository-name ${repo} --output json | jq ' .imageDetails[].imageTags | select( length > 0) | join("\n")' > "${repo}-image-tags"
        for tag in `cat ${repo}-image-tags`; do
            aws ecr batch-get-image --repository-name ${repo} --image-ids imageTag=${merge_commit} --query images[].imageManifest --output text > ${merge_commit}.manifest
            if [[ -n `grep ${tag} "${repo}-merge-commits ${repo}-tags"` ]];
            then
                aws ecr put-image --repository-name ${repo} --image-tag ${SAVE_TAG} --image-manifest ${merge_commit}.manifest
            elif [[ -n `grep ${tag} "${repo}-all-commits"` ]]
                aws ecr put-image --repository-name ${repo} --image-tag ${CLEANUP_TAG} --image-manifest ${merge_commit}.manifest
            fi
        done
    done
done
