FROM denoland/deno

COPY . .

EXPOSE 8000


RUN deno install --entrypoint backend/replicache_serve.ts

CMD ["run", "--allow-net", "--allow-read", "--allow-write", "backend/replicache_serve.ts"]