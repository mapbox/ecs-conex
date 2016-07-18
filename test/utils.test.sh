#!/usr/bin/env bash

set -eu
source ../utils.sh

# before_image()
export AccountId=1
export repo=repo
export before=1
export after=2
before_image us-east-1
