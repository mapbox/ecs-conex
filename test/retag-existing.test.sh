function aws() {
	if [[ $2 == "describe-repositories"]]; then
		`cat test/fixtures/desc-repo`
	fi
}