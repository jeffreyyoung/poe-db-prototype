set -e

deno task test

deno task docker:up
deno task test:docker
deno task docker:down

npx esbuild replicache.ts --bundle --format=esm --outfile=dist/replicache.js
npx esbuild replicache.ts --bundle --format=esm --outfile=replicache.js
git add -A
git commit -m "update"
sh ./_update_readme.sh
git add -A
git commit -m "update readme"
git push
