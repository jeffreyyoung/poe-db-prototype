npx esbuild replicache.ts --bundle --format=esm --outfile=dist/replicache.js
git add -A
git commit -m "update"
sh ./_update_readme.sh
git add -A
git commit -m "update readme"
git push
