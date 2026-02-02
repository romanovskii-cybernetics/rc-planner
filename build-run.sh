#!/usr/bin/env bash

if [[ "$*" == *"--nogui"* ]]
then
  echo Not building frontend...
else
  echo Building frontend...
  ( cd frontend && npm run build ) || exit 1
fi

echo Building backend...
go build -o ./build/dev || exit 1
chmod +x ./build/dev

./build/dev