# Use a lightweight official Python image
FROM docker.io/python:3.12.10-slim
# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set the working directory in the container
WORKDIR /app

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1

# Copy from the cache instead of linking since it's a mounted volume
ENV UV_LINK_MODE=copy

# Copy the project into the image

# Sync the project into a new environment, asserting the lockfile is up to date
WORKDIR /app

COPY . /app

# COPY app.py /app
RUN uv sync --frozen --no-dev &&\
	uv pip install .

# Place executables in the environment at the front of the path
ENV PATH="/app/.venv/bin:$PATH"
# Command to run the Flask application
# Use gunicorn or similar for production; Flask's built-in server is for development.

# CMD ["uv", "run", "python", "app.py"]
