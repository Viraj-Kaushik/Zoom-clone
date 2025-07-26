import { Server } from "socket.io";

let connections = {}        // array of meeting codes which has array of users in it as value
let messages = {}
let timeOnline = {}

export const connectToSocket = (server) => {
    
    const io = new Server(server, {
        cors : {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["*"],
            credentials: true
        }
    } );

    io.on("connection", (socket) => {

        // request from frontend to join a meeting 

        console.log("Something connected");

        socket.on("join-call", (path) => {

            if(connections[path] === undefined ){
                connections[path] = []
            }

            connections[path].push(socket.id);

            timeOnline[socket.id] = new Date();

            // telling all users in meeting that a user has joined

            for(let a=0; a < connections[path].length; a++ ){

                io.to(connections[path][a]).emit("user-joined", socket.id, connections[path]);

            }

            // messages of the meeting 

            if( messages[path] !== undefined ){

                for(let a=0; a < messages[path].length; a++ ){

                    // sending messages to only the new user joined that's why .to(socket.id)
                    io.to(socket.id).emit( "chat-messages", 
                        messages[path][a]['data'],
                        messages[path][a]['sender'],
                        messages[path][a]['socket-id-sender']
                    )

                }

            }

        } )

        socket.on("signal", (toId, message) => {
            io.to(toId).emit("signal", socket.id, message );
        } )

        // listens for incomming messages and broadcasts to all other members

        socket.on("chat-message", (data, sender) => {

            // matching room = room where the user is

            const [matchingRoom, found] = Object.entries(connections)
            .reduce(([room, isFound], [roomKey, roomValue]) => {


                if (!isFound && roomValue.includes(socket.id)) {
                    return [roomKey, true];
                }

                return [room, isFound];

            }, ['', false]);

            if (found === true) {

                if (messages[matchingRoom] === undefined) {

                    messages[matchingRoom] = []

                }

                // storing the message
                messages[matchingRoom].push( { 
                    'sender': sender, 
                    "data": data, 
                    "socket-id-sender": socket.id,
                } )

                console.log("message", matchingRoom, ":", sender, data)

                connections[matchingRoom].forEach((elem) => {

                    io.to(elem).emit("chat-message", data, sender, socket.id)

                })
            }

        } )

        socket.on("disconnect", () => {

            var diffTime = Math.abs(timeOnline[socket.id] - new Date())

            var key     // room or meeting code of the user leaving meeting

            // for (const [k, v] of JSON.parse(JSON.stringify(Object.entries(connections)))) {

            for (const [k, v] of Object.entries(connections)) {

                for (let a = 0; a < v.length; ++a) {
                    if (v[a] === socket.id) {
                        key = k

                        for (let a = 0; a < connections[key].length; ++a) {
                            io.to(connections[key][a]).emit('user-left', socket.id)
                        }

                        var index = connections[key].indexOf(socket.id)

                        connections[key].splice(index, 1)


                        if (connections[key].length === 0) {
                            delete connections[key]
                        }
                    }
                }

            }

        } )

    } )

    return io;

}