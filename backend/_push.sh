docker compose -f docker-compose.yml build

docker tag deno-image jeffreyyoung/deno-on-aws-lightsail

docker push jeffreyyoung/deno-on-aws-lightsail