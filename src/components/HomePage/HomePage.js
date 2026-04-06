import React from 'react';
import '../../colors.css';
import './HomePage.css';

const HomePage = ({ user, setCurrentView }) => {
  if (!user) {
    return (
      <div className="home-container">
        <h1>Bienvenido a MyTime</h1>
        <p>Tu plataforma para gestionar horas de trabajo y pagos.</p>
        <button className="home-button" onClick={() => setCurrentView('login')}>
          Iniciar Sesión
        </button>
      </div>
    );
  }

  return (
    <div className="home-container">
      <h1>Bienvenido, {user.displayName || user.email}</h1>
      <p>Tu plataforma para gestionar horas de trabajo y pagos.</p>
      <div className="home-buttons">
        <button className="home-button" onClick={() => setCurrentView('trabajos')}>
          Ver Mis Trabajos
        </button>
        <button className="home-button" onClick={() => setCurrentView('pago')}>
          Consultar Pago
        </button>
      </div>
    </div>
  );
};

export default HomePage;