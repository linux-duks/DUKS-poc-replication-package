# Use a lightweight official Python image
FROM python:3.12.10-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .

# Install the Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the Flask application file into the container
#COPY app.py .
#EXPOSE 5000

# Command to run the Flask application
# Use gunicorn or similar for production; Flask's built-in server is for development.
#CMD ["python", "app.py"]