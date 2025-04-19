npx esbuild replicache.ts --outfile=replicache.js
git add -A
git commit -m "update"
sh ./_update_readme.sh
git add -A
git commit -m "update"
git commit -m "update url"
git push
