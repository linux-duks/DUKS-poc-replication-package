console.log("Script linked")

async function get_commits(){
    result = await fetch("http://172.17.0.2:5000/commits")
    console.log(result)
}

get_commits()