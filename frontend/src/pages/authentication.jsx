import * as React from 'react';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import CssBaseline from '@mui/material/CssBaseline';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Typography from '@mui/material/Typography';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import Snackbar from '@mui/material/Snackbar';


// TODO remove, this demo shouldn't need to reset the theme.

const defaultTheme = createTheme();

export default function Authentication() {


    const [username, setUsername] = useState();
    const [password, setPassword] = useState();
    const [name, setName] = useState();

    const[error, setError] = useState();
    const[message, setMessage] = useState();

    const[formState, setFormState] = useState("sign-in");

    // for snackbar
    const[open, setOpen] = useState(false);

    const {handleRegister, handleLogin} = React.useContext(AuthContext);

    const handleAuth = async () => {

      try{

        if(formState === "sign-in"){
          
          let result = await handleLogin(username, password);
          

        }

        if(formState === "sign-up"){
          
          let result = await handleRegister(name, username, password);
          console.log(result);
          setMessage(result);
          setOpen(true);
          setError("");
          setFormState("sign-in");
          setUsername("");
          setPassword("");

        }

      }
      catch(err){
        
        let errMessage = (err.response.data.message); 
        setError(errMessage);
        
      }

    }

  return (


    <ThemeProvider theme={defaultTheme}>
      <Grid container component="main" sx={{ height: '100vh' }}>
        <CssBaseline />
        <Grid
          item
          xs={false}
          sm={4}
          md={7}
          sx={{
            backgroundImage: 'url(https://plus.unsplash.com/premium_photo-1669357657874-34944fa0be68?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)',
            backgroundRepeat: 'no-repeat',
            backgroundColor: (t) =>
              t.palette.mode === 'light' ? t.palette.grey[50] : t.palette.grey[900],
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <Grid item xs={12} sm={8} md={5} component={Paper} elevation={6} square>
          <Box
            sx={{
              my: 8,
              mx: 4,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <Avatar sx={{ m: 1, bgcolor: 'secondary.main' }}>
              <LockOutlinedIcon />
            </Avatar>
            
            <div>

                <Button 
                variant={ formState === "sign-in" ? "contained" : "" } 
                onClick={ () => {
                    setFormState("sign-in")
                }  }
                >
                    Sign In

                </Button>

                <Button 
                variant={ formState === "sign-up" ? "contained" : "" }
                onClick={ () => { 
                    setFormState("sign-up") 
                } }
                >

                    Sign Up

                </Button>

            </div>

            <Box component="form" noValidate sx={{ mt: 1 }}>

            {/* full name asked only when user is signing in */}

              { 
              formState === "sign-up" ? 
              <TextField
                margin="normal"
                required
                fullWidth
                id="full-name"
                label="Full Name"
                name="full-name"
                value={name}
                autoFocus

                onChange={ (e) => { setName(e.target.value) } }

              />  
              : <></> 
              }

              <TextField
                margin="normal"
                required
                fullWidth
                id="username"
                label="Username"
                name="username"
                value={username}
                autoFocus

                onChange={ (e) => { setUsername(e.target.value) } }

              />
              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="Password"
                type="password"
                value={password}
                id="password"

                onChange={ (e) => { setPassword(e.target.value) } }

              />

              {/* to display error */}

              <p style={{color: "red"}}> {error} </p>
              
              <Button
                type="button"
                fullWidth
                variant="contained"
                sx={{ mt: 3, mb: 2 }}
                onClick={handleAuth}
              >
                {
                  formState === "sign-in"? "Login" : "Register"
                }

                 
              </Button>
              
              
            </Box>
          </Box>
        </Grid>
      </Grid>

              {/* Snackbar */}

              <Snackbar
              open= {open}
              autoHideDuration={4000}
              message= {message}
              />



    </ThemeProvider>

  );

}