import React, { useState, useEffect } from 'react';
import './App.css';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './components/server/api';
import Navbar from './components/Navbar/Navbar';
import Login from './components/Login/Login';
import Register from './components/Register/Register';
import ResetPassword from './components/ResetPassword/ResetPassword';
import HomePage from './components/HomePage/HomePage';
import MisTrabajos from './components/MisTrabajos/MisTrabajos';
import ConsultarPago from './components/ConsultarPago/ConsultarPago';

function App() {
  const [currentView, setCurrentView] = useState('home');
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setCurrentView('home');
      } else {
        setCurrentView('login');
      }
    });
    return unsubscribe;
  }, []);

  const handleLogout = async () => {
    await auth.signOut();
    setCurrentView('login');
  };

  const renderView = () => {
    switch (currentView) {
      case 'login':
        return <Login setCurrentView={setCurrentView} />;
      case 'register':
        return <Register setCurrentView={setCurrentView} />;
      case 'reset':
        return <ResetPassword />;
      case 'home':
        return <HomePage user={user} setCurrentView={setCurrentView} />;
      case 'trabajos':
        return <MisTrabajos />;
      case 'pago':
        return <ConsultarPago />;
      default:
        return <HomePage user={user} setCurrentView={setCurrentView} />;
    }
  };

  if (!user && currentView !== 'register') {
    return (
      <div className="App">
        {renderView()}
        <ToastContainer />
      </div>
    );
  }

  return (
    <div className="App">
      <Navbar setCurrentView={setCurrentView} user={user} handleLogout={handleLogout} />
      <main style={{ minHeight: 'calc(100vh - 60px)' }}>
        {renderView()}
      </main>
      <ToastContainer />
    </div>
  );
}

export default App;
