#!/bin/bash

magenta='\033[35m'
turquoise='\033[36m'
white='\033[00m'

echo -e -n "Enter the GitHub user name: " && read -e user
echo -e -n "Enter the GitHub repository name: " && read -e repo
echo -e -n "Enter the array of whitelisted commit GitShas: " && read -e whitelist

# Reformats array for confirmation
prep=$(echo $whitelist | sed 's/\[//g' | sed 's/\]//g' | sed 's/ //g' | sed 's/,/ /g')
array=($prep)
string+=$(printf "%s," "${array[@]}" | cut -d "," -f 1-${#array[@]})

echo -e "\nClean-up configuration"
echo -e "**********************"
echo -e "GitHub user: ${turquoise}${user}${white}"
echo -e "GitHub repo: ${turquoise}${repo}${white}"
echo -e "Commit whitelist:"
echo -e "${turquoise}${string}${white}" | tr , "\n"
echo -e "\n${magenta}[warning]${white} All GitShas not whitelisted are subject to deletion"
echo -e -n "${magenta}[confirm]${white} Are you sure you want to cleanup? ${turquoise}(y/N)${white} " && read -e confirmation

if [ -z ${confirmation} ]; then
  confirmation=N
elif [ ${confirmation} != "y" -a ${confirmation} != "N" ]; then
  echo "Must confirm with \"y\" or \"N\"" && exit
fi

if [ ${confirmation} == "y" ]; then
  echo "Cleaning up ${repo}..."
  node scripts/cleanup.js ${user} ${repo} ${whitelist}
fi
