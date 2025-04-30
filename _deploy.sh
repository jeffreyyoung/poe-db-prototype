docker compose -f docker-compose.yml build

docker tag jeff-poe-image registry.digitalocean.com/jeff-poe/jeff-poe-image:new

docker push registry.digitalocean.com/jeff-poe/jeff-poe-image:new