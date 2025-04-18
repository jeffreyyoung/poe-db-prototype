npx esbuild replicache.ts --outfile=replicache.js
git add -A
git commit -m "update"
sh ./get_url.sh
git commit -m "update url"
git push
