FROM denoland/deno

COPY . .

EXPOSE 8000


RUN deno install --entrypoint backend/replicache_server.ts

CMD ["run", "--allow-net", "--allow-read", "--allow-write", "backend/replicache_server.ts"]