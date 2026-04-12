import React, { useEffect, useState } from 'react';
import { FiClock } from 'react-icons/fi';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../server/api';
import '../../colors.css';
import './HomePage.css';
import Loading from '../loading/loading';

const getTodayDateInput = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatName = (value) => {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const HomePage = ({ user, setCurrentView }) => {
  const [hasRegisteredToday, setHasRegisteredToday] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const checkTodayRegistration = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, 'horasTrabajadas', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const today = getTodayDateInput();
          setHasRegisteredToday(!!data.dias && !!data.dias[today]);
        } else {
          setHasRegisteredToday(false);
        }
      } catch (error) {
        console.error('Error checking today registration:', error);
        setHasRegisteredToday(false);
      } finally {
        setLoading(false);
      }
    };

    checkTodayRegistration();
  }, [user]);

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

  const displayName = user.displayName ? formatName(user.displayName) : user.email;

  if (loading) {
    return (
      <div className="home-container">
        <Loading text="Cargando..." />
      </div>
    );
  }

  return (
    <div className="home-container">
      <h1>
        {hasRegisteredToday
          ? `Felicidades ${displayName}, Ya tienes el registro de hoy`
          : `Bienvenido ${displayName}, Hoy no has ingresado tu entrada ni salida`
        }
      </h1>
      <p>Tu plataforma para gestionar horas de trabajo y pagos.</p>
      <div className="home-buttons">
        <button className="home-button" onClick={() => setCurrentView('registerhours')}>
          <FiClock size={18} style={{ marginRight: '10px' }} />
          Registrar Horas
        </button>
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