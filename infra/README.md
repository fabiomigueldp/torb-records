# Infrastructure Setup

This directory contains the configuration for the production and supporting infrastructure of the application.

## Files

-   **`docker-compose.prod.yml`**: Defines the services, networks, and volumes for the production environment. It orchestrates the `api`, `web` (Nginx), and `caddy` (reverse proxy) services.
-   **`Caddyfile`**: Configuration for the Caddy reverse proxy. Caddy handles incoming HTTPS traffic, obtains SSL certificates, and routes requests to the appropriate backend services (`api` or `web`).
-   **`docker-compose.yml` (Root Directory)**: The development Docker Compose file has also been updated to be aware of the named volumes used in production, mounting local directories for an easier development workflow (e.g., `./media-data`, `./upload-data`, `./config-data`).

## Services (Production - `docker-compose.prod.yml`)

1.  **`api`**: The backend application service.
    *   Image: `your-prod-api-image:latest` (This is a placeholder; you'll need to build your actual production API image).
    *   Exposes port 8000 internally to the Docker network.
2.  **`web`**: An Nginx service (`nginx:alpine`) that serves the static frontend application.
    *   Content is expected to be built into `../frontend/dist` and is served from `/usr/share/nginx/html` within the container.
3.  **`caddy`**: The reverse proxy and SSL termination point (`caddy:2-alpine`).
    *   Manages all incoming web traffic.
    *   Listens on host ports 80 (for HTTP to HTTPS redirection) and 443 (for HTTPS).

## Port Mapping (Production)

-   Host machine's port `80` is mapped to Caddy's port `80`.
-   Host machine's port `443` is mapped to Caddy's port `443`.

All external traffic should go through Caddy.

## HTTPS and SSL Certificates (Caddy)

-   **Automatic HTTPS**: For any public domain name configured in the `Caddyfile` (e.g., `your-domain.com`), Caddy will automatically attempt to provision and renew SSL certificates from Let's Encrypt.
-   **Self-Signed Certificates (Fallback)**: If Caddy cannot obtain a certificate from a public CA (e.g., when using `localhost` or a domain that doesn't resolve publicly), it will automatically generate and use a self-signed certificate. You might see browser warnings for self-signed certificates, which is expected in such scenarios.

## Named Volumes (Production)

The following named volumes are defined in `docker-compose.prod.yml` to persist data:

-   **`media-data`**: Stores media files.
    *   Mounted at `/media` in the `api` service.
    *   Potentially accessible by `web` or proxied by `caddy` if configured.
-   **`upload-data`**: Stores user uploads or other temporary/processed files.
    *   Mounted at `/uploads` in the `api` service.
    *   Potentially accessible by `web` or proxied by `caddy` if configured.
-   **`config-data`**: Stores configuration files, such as `users.json` or other runtime configurations.
    *   Mounted at `/config` in the `api` service.
    *   Mounted at `/app-config` in the `caddy` service (e.g., if Caddy needs to read specific application configurations, though this is less common).
-   **`caddy_data`**: Internal Caddy volume for storing SSL certificates and other persistent Caddy state.
-   **`caddy_config`**: Internal Caddy volume for storing its configuration.

## Development Environment (`docker-compose.yml`)

The main `docker-compose.yml` at the root of the project is used for local development. It has been updated to:
- Define the same named volumes (`media-data`, `upload-data`, `config-data`).
- Bind-mount local directories (`./media-data`, `./upload-data`, `./config-data`) to the `api` service containers for these volumes. This allows easy access and modification of data during development. Ensure these directories exist locally (they should have been created with `.gitkeep` files).

## Running Production Setup Locally (for testing)

To test the production-like environment locally (using `localhost` and self-signed certificates):

```bash
docker-compose -f infra/docker-compose.prod.yml up --build
```

You should then be able to access services via `http://localhost` (which Caddy will redirect to HTTPS) or `https://localhost`.
- Accessing `/api/some-endpoint` would go to your API.
- Accessing `/` would serve the frontend application.

Remember to replace placeholder image names and domain names with your actual values for a real deployment.
