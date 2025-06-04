import pandas as pd
from flask import Flask, request, jsonify, make_response

app = Flask(__name__)

def _build_cors_preflight_response():
    response = make_response()
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add("Access-Control-Allow-Headers", "*")
    response.headers.add("Access-Control-Allow-Methods", "*")
    return response

@app.route('/commits', methods=['GET'])
def get_commits():
    """
    Endpoint to serve the mock Git commit data.
    """
    # Convert DataFrame to a list of dictionaries (records)
    # This is a common way to serialize DataFrames for JSON API responses.
    if request.method == "OPTIONS": # CORS preflight
        return _build_cors_preflight_response()
    elif request.method == "GET":
        response = jsonify(pd.read_csv("../data/mock1.csv").to_dict(orient='records'))
        response.headers.add("Access-Control-Allow-Origin", "*")
        return response
    else:
        raise RuntimeError("Weird - don't know how to handle method {}".format(request.method))

@app.route('/')
def home():
    return "This sample server serves the commit data at the '/commits' endpoint"

if __name__ == '__main__':
    # Use 0.0.0.0 to make the server accessible from outside the container
    app.run(host='0.0.0.0', port=5000, debug=True)