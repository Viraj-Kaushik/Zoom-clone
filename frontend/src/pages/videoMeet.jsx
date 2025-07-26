import React, {useEffect, useRef, useState} from 'react'
import io from "socket.io-client"

import { TextField, Button, Badge, IconButton  } from "@mui/material"
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff'
import CallEndIcon from '@mui/icons-material/CallEnd'
import MicIcon from '@mui/icons-material/Mic'
import MicOffIcon from '@mui/icons-material/MicOff'
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare'
import ChatIcon from '@mui/icons-material/Chat'

import server from '../environment';

import styles from "../styles/videoComponent.module.css"

const server_url = server;

var connections = {};

// Add this at the top level to queue ICE candidates
var pendingIceCandidates = {};

const peerConfigConnections = {
    "iceServers": [
        { "urls": "stun:stun.l.google.com:19302" }
    ]
}

// Move utility functions to the top to avoid hoisting issues
const silence = () => {
    let ctx = new AudioContext()
    let oscillator = ctx.createOscillator()
    let dst = oscillator.connect(ctx.createMediaStreamDestination())
    oscillator.start()
    ctx.resume()
    return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false })
}

const black = ({ width = 640, height = 480 } = {}) => {
    let canvas = Object.assign(document.createElement("canvas"), { width, height })
    canvas.getContext('2d').fillRect(0, 0, width, height)
    let stream = canvas.captureStream()
    return Object.assign(stream.getVideoTracks()[0], { enabled: false })
}

export default function VideoMeet() {

  var socketRef = useRef();
  let socketIdRef = useRef();     // current user's socket id

  let localVideoref = useRef();   // user's video DOM element

  let [videoAvailable, setVideoAvailable] = useState(true);

  let [audioAvailable, setAudioAvailable] = useState(true);

  let [video, setVideo] = useState();

  let [audio, setAudio] = useState();

  let [screen, setScreen] = useState();

  let [screenAvailable, setScreenAvailable] = useState();

  let [showModal, setModal] = useState(true);

  let [messages, setMessages] = useState([])

  let [message, setMessage] = useState("");

  let [newMessages, setNewMessages] = useState(3);

  let [askForUsername, setAskForUsername] = useState(true);

  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  let [username, setUsername] = useState("");

  const videoRef = useRef([]);    // track of peer video streams

  let [videos, setVideos] = useState([]);

  // ask for permissions and display user video in lobby
  const getPermissions = async () => {

    if (permissionsLoaded) return;

    try{

      // video
      const videoPermission =  await navigator.mediaDevices.getUserMedia({video: true})

      if(videoPermission){
        setVideoAvailable(true);
        videoPermission.getTracks().forEach(track => track.stop()); // Stop test stream
      }
      else{
        setVideoAvailable(false);
      }

      // audio
      const audioPermission =  await navigator.mediaDevices.getUserMedia({audio: true})

      if(audioPermission){
        setAudioAvailable(true);
        audioPermission.getTracks().forEach(track => track.stop()); // Stop test stream
      }
      else{
        setAudioAvailable(false);
      }

      // screen-share
      if(navigator.mediaDevices.getDisplayMedia){
        setScreenAvailable(true);
      }
      else{
        setScreenAvailable(false);
      }

      setPermissionsLoaded(true);

      // displaying video
      if( (videoAvailable || audioAvailable) && !window.localStream ){

        const userMediaStream = await navigator.mediaDevices.getUserMedia({video: videoAvailable, audio: audioAvailable});

        if(userMediaStream){

          window.localStream = userMediaStream;
          if(localVideoref.current){
            localVideoref.current.srcObject = userMediaStream;
          }

        }

      }

    }
    catch(err) {

      console.log(err);
      setPermissionsLoaded(true);

    }

  }

  useEffect( () => {

    getPermissions()

  }, [] );

  // Updates video display and sends new stream to all connected users
  let getUserMediaSuccess = (stream) => {

    try {
        if (window.localStream) {
            window.localStream.getTracks().forEach(track => track.stop());
        }
    } catch (e) { 
        console.log(e);
    }

    window.localStream = stream;
    if (localVideoref.current) {
        localVideoref.current.srcObject = stream;
    }

    // Update all peer connections with new stream
    for (let id in connections) {
        if (id === socketIdRef.current) continue;

        try {
            // Remove old streams first - but check if senders exist
            const senders = connections[id].getSenders();
            senders.forEach(sender => {
                if (sender.track) {
                    connections[id].removeTrack(sender);
                }
            });

            // Add new stream tracks - check for duplicates
            stream.getTracks().forEach(track => {
                const existingSender = connections[id].getSenders().find(sender => 
                    sender.track && sender.track.id === track.id
                );
                
                if (!existingSender) {
                    connections[id].addTrack(track, stream);
                }
            });

            // Only create offer if we're in stable state
            if (connections[id].signalingState === 'stable') {
                connections[id].createOffer()
                .then((description) => {
                    return connections[id].setLocalDescription(description);
                })
                .then(() => {
                    socketRef.current.emit('signal', id, JSON.stringify({ 
                        'sdp': connections[id].localDescription 
                    }));
                })
                .catch(e => console.log('Error creating/setting offer:', e));
            } else {
                console.log('Cannot create offer, signaling state is:', connections[id].signalingState);
            }
        } catch (e) {
            console.log('Error updating peer connection:', e);
        }
    }

      // camera or mic turned off
      stream.getTracks().forEach( track => track.onended = () => {

          setVideo(false);
          setAudio(false);

          try {
            if (localVideoref.current && localVideoref.current.srcObject) {
                let tracks = localVideoref.current.srcObject.getTracks();
                tracks.forEach(track => track.stop());
            }
          } catch (e) { 
              console.log(e); 
          }

          // Create black/silent stream
          let blackSilence = (...args) => new MediaStream([black(...args), silence()]);
          window.localStream = blackSilence();
          if (localVideoref.current) {
              localVideoref.current.srcObject = window.localStream;
          }

          // Update peer connections with black/silent stream
          for (let id in connections) {
              try {
                  // Remove old tracks - but check if they exist first
                  const senders = connections[id].getSenders();
                  senders.forEach(sender => {
                      if (sender.track) {
                          connections[id].removeTrack(sender);
                      }
                  });

                  // Add black/silent tracks - check for duplicates
                  window.localStream.getTracks().forEach(track => {
                      const existingSender = connections[id].getSenders().find(sender => 
                          sender.track && sender.track.id === track.id
                      );
                      
                      if (!existingSender) {
                          connections[id].addTrack(track, window.localStream);
                      }
                  });

                  if (connections[id].signalingState === 'stable') {
                      connections[id].createOffer()
                      .then((description) => {
                          return connections[id].setLocalDescription(description);
                      })
                      .then(() => {
                          socketRef.current.emit('signal', id, JSON.stringify({ 
                              'sdp': connections[id].localDescription 
                          }));
                      })
                      .catch(e => console.log(e));
                  }
              } catch (e) {
                  console.log('Error in track ended handler:', e);
              }
          }
      })

  }

  // when user mutes/closes camera in the meeting
  let getUserMedia = () => {

    if( (video && videoAvailable) || (audio && audioAvailable) ){
        navigator.mediaDevices.getUserMedia( {video: video, audio: audio} )
        .then( getUserMediaSuccess )
        .then( (stream) => {} )
        .catch( (e) => console.log(e) )
    } else {
            try{
              if (window.localStream) {
                  let tracks = window.localStream.getTracks();
                  tracks.forEach( track => track.stop() );
              }
            }
            catch(e){
                console.log(e);
            }
    }

  }

  // runs when change in audio,video state
  useEffect( () => {

    if( video !== undefined && audio !== undefined ){
      getUserMedia();
    }

  }, [audio, video] )

  let gotMessageFromServer = (fromId, message) => {

    var signal = JSON.parse(message)

    if (fromId !== socketIdRef.current) {
        // Initialize pending ICE candidates array for this peer if it doesn't exist
        if (!pendingIceCandidates[fromId]) {            //** */
            pendingIceCandidates[fromId] = [];          //* */
        }                                               //** */

        if (signal.sdp) {
            // CRITICAL FIX: Check signaling state before setting remote description
            const currentState = connections[fromId].signalingState;
            console.log(`Received ${signal.sdp.type} from ${fromId}, current state: ${currentState}`);
            
            // Only proceed if we're in the correct state
            if ((signal.sdp.type === 'offer' && (currentState === 'stable' || currentState === 'have-local-offer')) ||
                (signal.sdp.type === 'answer' && currentState === 'have-local-offer')) {
                
                connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp))
                .then(() => {
                    console.log('Remote description set for', fromId);
                    
                    // Process any pending ICE candidates now that remote description is set
                    if (pendingIceCandidates[fromId] && pendingIceCandidates[fromId].length > 0) {
                        console.log('Processing', pendingIceCandidates[fromId].length, 'pending ICE candidates for', fromId);
                        pendingIceCandidates[fromId].forEach(candidate => {
                            connections[fromId].addIceCandidate(new RTCIceCandidate(candidate))
                            .catch(e => console.log('Error adding queued ICE candidate:', e));
                        });
                        pendingIceCandidates[fromId] = []; // Clear the queue
                    }

                    if (signal.sdp.type === 'offer') {
                        // Check if we're in the right state to create an answer
                        if (connections[fromId].signalingState === 'have-remote-offer') {
                            connections[fromId].createAnswer()
                            .then((description) => {
                                return connections[fromId].setLocalDescription(description);
                            })
                            .then(() => {
                                socketRef.current.emit('signal', fromId, JSON.stringify({ 
                                    'sdp': connections[fromId].localDescription 
                                }));
                            })
                            .catch(e => console.log('Error creating/setting answer:', e));
                        } else {
                            console.log('Cannot create answer, wrong signaling state:', connections[fromId].signalingState);
                        }
                    }
                })
                .catch(e => console.log('Error setting remote description:', e));
            } else {
                console.log(`Ignoring ${signal.sdp.type} from ${fromId} due to wrong state: ${currentState}`);
            }
        }

        if (signal.ice) {
            // Check if remote description is set before adding ICE candidate
            if (connections[fromId].remoteDescription && connections[fromId].remoteDescription.type) {
                connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice))
                .catch(e => console.log('Error adding ICE candidate:', e));
            } else {
                // Queue the ICE candidate to be processed later
                console.log('Queueing ICE candidate for', fromId);
                pendingIceCandidates[fromId].push(signal.ice);
            }
        }
    }

  }

  // Helper function to add local stream to peer connection
  const addLocalStreamToPeer = (peerId) => {
    try {
        if (window.localStream && connections[peerId]) {
            window.localStream.getTracks().forEach(track => {
                // Check if a sender already exists for this track
                const existingSender = connections[peerId].getSenders().find(sender => 
                    sender.track && sender.track.id === track.id
                );
                
                if (!existingSender) {
                    console.log('Adding track to peer:', peerId, 'Track kind:', track.kind);
                    connections[peerId].addTrack(track, window.localStream);
                }
            });
        } else if (connections[peerId]) {
            // Create black/silent stream if no local stream
            let blackSilence = (...args) => new MediaStream([black(...args), silence()]);
            const fallbackStream = blackSilence();
            
            fallbackStream.getTracks().forEach(track => {
                const existingSender = connections[peerId].getSenders().find(sender => 
                    sender.track && sender.track.id === track.id
                );
                
                if (!existingSender) {
                    console.log('Adding fallback track to peer:', peerId, 'Track kind:', track.kind);
                    connections[peerId].addTrack(track, fallbackStream);
                }
            });
        }
    } catch (e) {
        console.log('Error adding local stream to peer:', e);
    }
  };

  // to establish WebSocket connection (establish and destroy peer connection when user joins and leaves meeting)
  let connectToSocketServer = () => {

        socketRef.current = io.connect(server_url, { secure: false })

        socketRef.current.on('signal', gotMessageFromServer)

        socketRef.current.on('connect', () => {

            socketRef.current.emit('join-call', window.location.href)
            socketIdRef.current = socketRef.current.id

            // listens for chat messages
            socketRef.current.on('chat-message', addMessage)

            // removing video of left user
            socketRef.current.on('user-left', (id) => {
                console.log('User left:', id);
                // Clean up the peer connection
                if (connections[id]) {
                    connections[id].close();
                    delete connections[id];
                }
                
                // Clean up pending ICE candidates
                if (pendingIceCandidates[id]) {
                    delete pendingIceCandidates[id];
                }
                
                // Remove video from state
                setVideos((videos) => videos.filter((video) => video.socketId !== id))
            })

            // clients consist of members in the meeting
            socketRef.current.on('user-joined', (id, clients) => {
                console.log('User joined event. ID:', id, 'Clients:', clients, 'My ID:', socketIdRef.current);

                // CRITICAL FIX: Only create connections for peers we don't already have
                const newPeers = clients.filter(socketListId => 
                    socketListId !== socketIdRef.current && !connections[socketListId]
                );

                console.log('Creating connections for new peers:', newPeers);

                newPeers.forEach((socketListId) => {

                    console.log('Creating peer connection for:', socketListId);

                    // Initialize pending ICE candidates for new peer
                    pendingIceCandidates[socketListId] = [];
                    
                    connections[socketListId] = new RTCPeerConnection(peerConfigConnections)
                    
                    // Wait for their ice candidate       
                    connections[socketListId].onicecandidate = function (event) {
                        if (event.candidate != null) {
                            socketRef.current.emit('signal', socketListId, JSON.stringify({ 'ice': event.candidate }))
                        }
                    }

                    // Handle incoming tracks from remote peer
                    connections[socketListId].ontrack = (event) => {
                        console.log("Received track from", socketListId, "Track kind:", event.track.kind);

                        // Only update when we receive a video track to avoid duplicates
                        if (event.track.kind === 'video') {
                            setVideos(currentVideos => {
                                let videoExists = currentVideos.find(video => video.socketId === socketListId);

                                if (videoExists) {
                                    console.log("Updating existing video stream for:", socketListId);
                                    // Update the stream of the existing video
                                    const updatedVideos = currentVideos.map(video =>
                                        video.socketId === socketListId ? { ...video, stream: event.streams[0] } : video
                                    );
                                    videoRef.current = updatedVideos;
                                    return updatedVideos;
                                } else {
                                    // Create a new video only if it doesn't exist
                                    console.log("Creating new video entry for:", socketListId);
                                    let newVideo = {
                                        socketId: socketListId,
                                        stream: event.streams[0],
                                        autoplay: true,
                                        playsinline: true
                                    };

                                    const updatedVideos = [...currentVideos, newVideo];
                                    videoRef.current = updatedVideos;
                                    return updatedVideos;
                                }
                            });
                        }
                    };   

                    // Connection state change handler for debugging
                    connections[socketListId].onconnectionstatechange = () => {
                        console.log('Connection state changed for', socketListId, ':', connections[socketListId].connectionState);
                    };

                    connections[socketListId].onsignalingstatechange = () => {
                        console.log('Signaling state changed for', socketListId, ':', connections[socketListId].signalingState);
                    };

                    // CRITICAL FIX: Add local stream to peer connection immediately
                    addLocalStreamToPeer(socketListId);

                })  // end of newPeers forEach loop

                // CRITICAL FIX: Only the newly joined user should create offers
                // This prevents duplicate offer/answer exchanges
                if (id === socketIdRef.current && newPeers.length > 0) {
                    console.log('I am the new user, creating offers to existing peers:', newPeers);
                    
                    // Small delay to ensure all connections are properly initialized
                    setTimeout(() => {
                        newPeers.forEach(peerId => {
                            console.log('Creating offer to existing peer:', peerId);

                            try {
                                // Create offer only if in stable state
                                if (connections[peerId] && connections[peerId].signalingState === 'stable') {
                                    connections[peerId].createOffer()
                                    .then((description) => {
                                        return connections[peerId].setLocalDescription(description);
                                    })
                                    .then(() => {
                                        console.log('Sending offer to:', peerId);
                                        socketRef.current.emit('signal', peerId, JSON.stringify({ 
                                            'sdp': connections[peerId].localDescription 
                                        }));
                                    })
                                    .catch(e => console.log('Error creating offer to', peerId, ':', e));
                                } else {
                                    console.log('Cannot create offer to', peerId, ', signaling state:', connections[peerId]?.signalingState);
                                }
                            } catch (e) { 
                                console.log('Error setting up peer connection for', peerId, ':', e);
                            }
                        });
                    }, 100);
                } else {
                    console.log('Someone else joined, I will wait for their offer');
                }
            })
        })
    }

  let getMedia = () => {
    setVideo(videoAvailable);
    setAudio(audioAvailable);
    connectToSocketServer();
  }

  // clicks on join meeting btn
  let connect = () => {
    setAskForUsername(false);
    getMedia();
  }

  // Add cleanup function
  useEffect(() => {
    return () => {
        // Cleanup on component unmount
        Object.keys(connections).forEach(id => {
            if (connections[id]) {
                connections[id].close();
                delete connections[id];
            }
        });
        
        if (window.localStream) {
            window.localStream.getTracks().forEach(track => track.stop());
        }
        
        if (socketRef.current) {
            socketRef.current.disconnect();
        }
        
        // Clear pending ICE candidates
        pendingIceCandidates = {};
    };
  }, []);

    let handleVideo = () => {
    setVideo(!video);
  }

  let handleAudio = () => {
    setAudio(!audio)
  }

//   screen share


  let getDislayMediaSuccess = (stream) => {
        console.log("HERE")
        try {
            window.localStream.getTracks().forEach(track => track.stop())
        } catch (e) { console.log(e) }

        window.localStream = stream
        localVideoref.current.srcObject = stream

        for (let id in connections) {
            if (id === socketIdRef.current) continue

            connections[id].addStream(window.localStream)

            connections[id].createOffer().then((description) => {
                connections[id].setLocalDescription(description)
                    .then(() => {
                        socketRef.current.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }))
                    })
                    .catch(e => console.log(e))
            })
        }

        stream.getTracks().forEach(track => track.onended = () => {
            setScreen(false)

            try {
                let tracks = localVideoref.current.srcObject.getTracks()
                tracks.forEach(track => track.stop())
            } catch (e) { console.log(e) }

            let blackSilence = (...args) => new MediaStream([black(...args), silence()])
            window.localStream = blackSilence()
            localVideoref.current.srcObject = window.localStream

            getUserMedia()

        })
    }


  let getDisplayMedia = () => {

    if (screen) {
        if (navigator.mediaDevices.getDisplayMedia) {
            navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
                .then(getDislayMediaSuccess)
                .then((stream) => { })
                .catch((e) => console.log(e))
        }
    }

  }

  useEffect( ()  => {
    if(screen !== undefined){
        getDisplayMedia();
    }
  }, [screen] )

  let handleScreen = () => {
    setScreen(!screen);
  }



  //   chat messages

  let handleChat = () => {
    
  }

   let sendMessage = () => {
        console.log(socketRef.current);
        socketRef.current.emit('chat-message', message, username)
        setMessage("");

        // this.setState({ message: "", sender: username })
    }

    let addMessage = (data, sender, socketIdSender) => {

        setMessages( (prevMsgs) => [
            ...prevMsgs, 
            { sender: sender, data: data}
        ] )

        // i am not the who sent the message
        if( socketIdSender !== socketIdRef.current ){

            setNewMessages( (prevMsgs) => prevMsgs+ 1 );

        }

    }

    

    // end call function

    let handleEndCall = () => {
        try {
            let tracks = localVideoref.current.srcObject.getTracks()
            tracks.forEach(track => track.stop())
        } catch (e) { console.log(e) }
        window.location.href = "/"
    }




  return (

    <div>

            {askForUsername === true ?

                <div>


                    <h2>Enter into Lobby </h2>
                    <TextField id="outlined-basic" label="Username" value={username} onChange={e => setUsername(e.target.value)} variant="outlined" />
                    <Button variant="contained" onClick={connect}>Connect</Button>


                    <div>
                        <video ref={localVideoref} autoPlay muted></video>
                    </div>

                </div> :


                <div className={styles.meetVideoContainer}>

                    {showModal ? <div className={styles.chatRoom}>

                        <div className={styles.chatContainer}>
                            <h1>Chat</h1>

                            <div className={styles.chattingDisplay}>

                                {messages.length !== 0 ? messages.map((item, index) => {

                                    console.log(messages)
                                    return (
                                        <div style={{ marginBottom: "20px" }} key={index}>
                                            <p style={{ fontWeight: "bold" }}>{item.sender}</p>
                                            <p>{item.data}</p>
                                        </div>
                                    )
                                }) : <p>No Messages Yet</p>}


                            </div>

                            <div className={styles.chattingArea}>
                                <TextField value={message} onChange={(e) => setMessage(e.target.value)} id="outlined-basic" label="Enter Your chat" variant="outlined" />
                                <Button variant='contained' onClick={sendMessage}>Send</Button>
                            </div>


                        </div>
                    </div> : <></>}


                    <div className={styles.buttonContainers}>
                        <IconButton onClick={handleVideo} style={{ color: "white" }}>
                            {(video === true) ? <VideocamIcon /> : <VideocamOffIcon />}
                        </IconButton>
                        <IconButton onClick={handleEndCall} style={{ color: "red" }}>
                            <CallEndIcon  />
                        </IconButton>
                        <IconButton onClick={handleAudio} style={{ color: "white" }}>
                            {audio === true ? <MicIcon /> : <MicOffIcon />}
                        </IconButton>

                        {screenAvailable === true ?
                            <IconButton onClick={handleScreen} style={{ color: "white" }}>
                                {screen === true ? <ScreenShareIcon /> : <StopScreenShareIcon />}
                            </IconButton> : <></>}

                        <Badge badgeContent={newMessages} max={999} color='orange'>
                            <IconButton onClick={() => setModal(!showModal)} style={{ color: "white" }}>
                                <ChatIcon />                        </IconButton>
                        </Badge>

                    </div>


                    <video className={styles.meetUserVideo} ref={localVideoref} autoPlay muted></video>

                    <div className={styles.conferenceView}>
                        {videos.map((video) => (
                            <div key={video.socketId}>
                                <video

                                    data-socket={video.socketId}
                                    ref={ref => {
                                        if (ref && video.stream) {
                                            ref.srcObject = video.stream;
                                        }
                                    }}
                                    autoPlay
                                >
                                </video>
                            </div>

                        ))}

                    </div>

                </div>

            }

        </div>

  )
}