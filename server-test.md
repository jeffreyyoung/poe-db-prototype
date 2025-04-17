1. Make an http request to https://jeffreyyoung-replicachebackendv2.web.val.run/pull/{randomString}?lastMutationId=0
assert the response is 200 and matches
{
    lastMutationId: 0,
    patches: []
}

2. Send a post request to https://jeffreyyoung-replicachebackendv2.web.val.run/push/{sameStringAsBefore}
With this body
{
    mutations: [
        {
            id: randomString,
            name: "addTodo",
            args: { text: "meow" },
            operations: [{
                key: "todos/1",
                value: { text: "meow" }
            }] 
        }
    ]
}
It should return this response
{
}

3.  Send the http request from step 1 and assert it looks like this
{
    lastMutationId: 1,
    patches: [{
        key: "todos/1",
        value: { text: "meow" },
        mutationId: 1
    }]
}

4. Send https://jeffreyyoung-replicachebackendv2.web.val.run/pull/{randomString}?lastMutationId=1 and assert the response is
{

    lastMutationId: 1,
    patches: []
}