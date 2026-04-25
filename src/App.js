import React, { useState, useEffect } from 'react';
import './App.css';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './components/server/api';
import Navbar from './components/Navbar/Navbar';
import Login from './components/Login/Login';
import Register from './components/Register/Register';
import ResetPassword from './components/ResetPassword/ResetPassword';
import HomePage from './components/HomePage/HomePage';
import MisTrabajos from './components/MisTrabajos/MisTrabajos';
import ConsultarPago from './components/ConsultarPago/ConsultarPago';
import CalendarComponent from './components/Calendar/calendar';
import Horario from './components/horario/horario';
import Loading from './components/loading/loading';
import RegisterHours from './components/registerhours/RegisterHours';
import ToastContainer from './components/ToastContainer';
import CopiModal from './funtions/copi';

function App() {
  const [currentView, setCurrentView] = useState('home');
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCopiModal, setShowCopiModal] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setCurrentView('home');
      } else {
        setCurrentView('login');
      }
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleLogout = async () => {
    setIsLoading(true);
    await auth.signOut();
  };

  const renderView = () => {
    switch (currentView) {
      case 'login':
        return <Login setCurrentView={setCurrentView} />;
      case 'register':
        return <Register setCurrentView={setCurrentView} />;
      case 'reset':
        return <ResetPassword setCurrentView={setCurrentView} />;
      case 'home':
        return <HomePage user={user} setCurrentView={setCurrentView} setShowCopiModal={setShowCopiModal} />;
      case 'trabajos':
        return <MisTrabajos user={user} />;
      case 'calendar':
        return <CalendarComponent user={user} />;
      case 'pago':
        return <ConsultarPago user={user} setCurrentView={setCurrentView} />;
      case 'registerhours':
        return <RegisterHours user={user} setCurrentView={setCurrentView} />;
      case 'horarios':
        return <Horario user={user} setCurrentView={setCurrentView} />;
      default:
        return <HomePage user={user} setCurrentView={setCurrentView} />;
    }
  };

  if (isLoading) {
    return <Loading />;
  }

  if (!user) {
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
      <CopiModal isOpen={showCopiModal} onClose={() => setShowCopiModal(false)} user={user} />
    </div>
  );
}

export default App;
