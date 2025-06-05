async function get_commits(){
    result = await fetch("commits")
    json_commits = await result.json()
    
    return json_commits
}

/**
 * Computes the sum of the LoC differences
 * for a sliding window.
 * @param {*} commits 
 */
function sliding_window_diffs(commits, intervalLengthDays){

    let running_minus = commits[0]["minus_diff"];
    let running_plus = commits[0]["plus_diff"];
    let running_acc = commits[0]["plus_diff"] - commits[0]["minus_diff"];

    let window_begin = 0;
    let window_end = 0;

    date_points = []
    plus_points = []
    minus_points = []
    acc_points = []

    for(i = 0; i < commits.length; i+=1){
        
        let thisDate = new Date(commits[i]["author_time"])
        const maxDate = new Date(thisDate).setDate(thisDate.getDate() + intervalLengthDays);
        const minDate = new Date(thisDate).setDate(thisDate.getDate() - intervalLengthDays);

        // First, update the datetime window. Starting with the last commit of the window
        while(window_end < commits.length - 1 && maxDate >= new Date(commits[window_end+1]["author_time"])){
            window_end+=1
            let new_plus = commits[window_end]["plus_diff"]
            let new_minus = commits[window_end]["minus_diff"]
            running_plus += new_plus
            running_minus += new_minus
            running_acc += new_plus - new_minus
        }

        //Update window beginning
        while(minDate > new Date(commits[window_begin]["author_time"])){
            window_begin += 1
            let old_plus = commits[window_begin]["plus_diff"]
            let old_minus = commits[window_begin]["minus_diff"]
            running_plus -= old_plus
            running_minus -= old_minus
            running_acc -= old_plus - old_minus
        }

        date_points.push(thisDate);
        plus_points.push(running_plus);
        minus_points.push(running_minus);
        acc_points.push(running_acc);
    }

    return [date_points, plus_points, minus_points, acc_points]
}

function plot_thing(commits){
    const window_results = sliding_window_diffs(commits,15)

    //for(commit of commits){
    //    dates.push(commit["author_time"])
    //} 

    var trace1 = {
        x: window_results[0],
        y: window_results[1],
        type: 'lines',
        //name: 'Trace 1'
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

}

get_commits().then( (commits) => plot_thing(commits))