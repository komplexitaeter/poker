# poker
An Agile Estimations Poker Tool for those teams, only connected online.

This is a LAMP stack based web-application (replace L with OS of your choice, of course). It is required, to have, more
or less, the following packages and/or services up and running: httpd(apache2 or nginx e.g.), php (php-fpm e.g,), php-json, php-mysql,
mysql-server, phpmyadmin (e.g.).

To install this project, loosely notice this steps:

1. Get sources from GIT, e.g.: git clone -b master https://github.com/komplexitaeter/poker /home/poker/public_html
2. Create database (e.g. pok_db) and User (e.g. pok_usr) and Grand CRUD operations on this database to user
3. Import database schema from db_schema_pok.sql (e.g. use phpmyadmin or mysql-cli)
4. Edit config.php (how and where to connect to your database)
5. Follow up on GIT komplexitaeter/poker-msg/README.md instructions to "really" have this "connected-only-feeling"

Tired of following all this steps? There is a pretty good chance to find a reasonable operational instance of this
project at https://poker.komplexitaeter.de to have fun immediately.