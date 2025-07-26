import './App.css';
import {Route, BrowserRouter as Router, Routes} from 'react-router-dom';

import LandingPage from './pages/landing';
import VideoMeet from './pages/videoMeet';
import Authentication from './pages/authentication';
import { AuthProvider } from './context/AuthContext';
import Home from './pages/home';
import History from './pages/history';


function App() {
  return (

    <Router>

      <AuthProvider>
        
      <Routes>

        <Route path='/' element={ <LandingPage /> } />

        <Route path='/auth' element = { <Authentication /> } />

        <Route path='/home' element = { <Home /> } />

        <Route path='/:url' element = { <VideoMeet /> }  />

        <Route path='/history' element = { <History /> }  />

      </Routes>

      </AuthProvider>

    </Router>

  );
}

export default App;
