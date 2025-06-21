# Stage 1: Build frontend
FROM node:18-alpine AS builder

WORKDIR /app/frontend

# Copy package.json and package-lock.json (or yarn.lock)
COPY frontend/package.json frontend/package-lock.json* ./

# Install dependencies
RUN npm install

# Copy the rest of the frontend application code
COPY frontend/ ./

# Build the frontend application
RUN npm run build

# Stage 2: Setup Python backend and serve frontend
FROM python:3.10-slim

WORKDIR /app

# Install backend dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY backend/ ./backend/
COPY alembic.ini .
COPY config ./config

# Copy built frontend static files from the builder stage
COPY --from=builder /app/frontend/dist /app/static

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application
# This might need adjustment based on how your backend serves the app
# For example, if using Uvicorn with FastAPI:
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
