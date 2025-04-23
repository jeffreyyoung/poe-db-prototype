npx esbuild replicache.ts --bundle --format=esm --outfile=replicache.js
npx esbuild replicache.ts --bundle --format=esm --outfile=public/replicache.js
npx esbuild SyncedMap.ts --bundle --format=esm --outfile=SyncedMap.js
npx esbuild SyncedMap.ts --bundle --format=esm --outfile=public/SyncedMap.js
npx esbuild redux.ts --bundle --format=esm --outfile=redux.js
npx esbuild redux.ts --bundle --format=esm --outfile=public/redux.js
git add -A
git commit -m "update"
sh ./_update_readme.sh
git add -A
git commit -m "update readme"
git push
