first time admin setup

curl --location 'http://localhost:8501/api/auth/setup' \
--header 'Content-Type: application/json' \
--data-raw '{"email":"----","name":"Admin","password":"----"}'