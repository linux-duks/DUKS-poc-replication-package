console.log("Script linked")

async function get_commits(){
    result = await fetch("commits")
    console.log(result)
}

get_commits()