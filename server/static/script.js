console.log("Script linked")

async function get_commits(){
    result = await fetch("commits")
    json_commits = await result.json()
    
    return json_commits
}

get_commits().then( (commits) => {
    
    console.log(commits)

    dates = []

    for(commit of commits){
        dates.push(commit["author_time"])
    } 
        var trace1 = {
            x: dates,
            type: 'histogram',
            name: 'Trace 1'
        };


        var data = [trace1];

        var layout = {
            title: 'Test plot with date histogram',
            xaxis: {
                title: 'Date'
            },
            yaxis: {
                title: 'No. Commits'
            }
        };


    Plotly.newPlot('plotDiv', data, layout);

})