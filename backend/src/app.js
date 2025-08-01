import express from "express";
import {createServer} from "node:http";

import { Server } from "socket.io";
import { connectToSocket } from "./controllers/socketManager.js";

import mongoose from "mongoose";

import cors from "cors";

import userRoutes from "./routes/users.routes.js";

const app = express();

const server = createServer(app);
const io = connectToSocket(server);

app.set("port", (process.env.PORT) || 8000 )
app.use(cors());
app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ limit: "40kb", extended: true }))

app.use("/api/v1/users", userRoutes );

app.get("/home" , (req, res) => {
    res.send("home route");
} )

const start = async () => {
    
    const connectionDb = await mongoose.connect("mongodb+srv://VirajKaushik:zoomclone-password@cluster0.wpqaiyh.mongodb.net/")
    server.listen( app.get("port") , () => {
        console.log("listening to port 8000");
    } );

}

start();  