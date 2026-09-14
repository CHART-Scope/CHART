\set ON_ERROR_STOP on

SELECT 'CREATE ROLE chart_keycloak LOGIN PASSWORD ''chart_keycloak'''
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'chart_keycloak')
\gexec

ALTER ROLE chart_keycloak WITH LOGIN PASSWORD 'chart_keycloak';

SELECT 'CREATE DATABASE chart_keycloak OWNER chart_keycloak'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'chart_keycloak')
\gexec

ALTER DATABASE chart_keycloak OWNER TO chart_keycloak;
