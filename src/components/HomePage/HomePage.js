import React, { useEffect, useState } from 'react';
import { FiClock } from 'react-icons/fi';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
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

const getMondayOfWeek = (date) => {
  const result = new Date(date);
  const day = result.getDay();
  const diff = (day + 6) % 7;
  result.setDate(result.getDate() - diff);
  result.setHours(0, 0, 0, 0);
  return result;
};

const formatDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
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

const getFirstName = (fullName) => {
  return fullName.trim().split(/\s+/)[0];
};

const HomePage = ({ user, setCurrentView, setShowCopiModal }) => {
  const [hasRegisteredToday, setHasRegisteredToday] = useState(false);
  const [todaySchedules, setTodaySchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState(null);

  useEffect(() => {
    if (!user) return;

    const checkTodayRegistration = async () => {
      setLoading(true);
      try {
        const [horasSnap, horariosSnap, usuarioSnap] = await Promise.all([
          getDoc(doc(db, 'horasTrabajadas', user.uid)),
          getDoc(doc(db, 'HORARIOS', user.uid)),
          getDoc(doc(db, 'usuarios', user.uid)),
        ]);

        let firstNameUser = 'Usuario';

        if (usuarioSnap.exists()) {
          const name = usuarioSnap.data().name;
          setUserName(name);
          firstNameUser = getFirstName(formatName(name));
        }

        const today = getTodayDateInput();
        const registered = horasSnap.exists() ? !!horasSnap.data()?.dias?.[today] : false;
        setHasRegisteredToday(registered);

        const allSchedules = [];

        // Horario propio
        if (horariosSnap.exists()) {
          const scheduleData = horariosSnap.data();
          const monday = getMondayOfWeek(new Date());
          const weekStartDate = formatDateInput(monday);
          const savedWeek = scheduleData?.semanas?.[weekStartDate];
          const todaySchedule = savedWeek?.days?.find((day) => day.date === today);

          if (todaySchedule) {
            if (todaySchedule.tipo === 'trabajado') {
              const start = todaySchedule.startTime || '00:00';
              const end = todaySchedule.endTime || '00:00';

              allSchedules.push({
                name: firstNameUser,
                ingreso: start,
                salida: end,
              });
            } else {
              allSchedules.push({
                name: firstNameUser,
                ingreso: '—',
                salida: '—',
              });
            }
          } else {
            allSchedules.push({
              name: firstNameUser,
              ingreso: '—',
              salida: '—',
            });
          }
        } else {
          allSchedules.push({
            name: firstNameUser,
            ingreso: '—',
            salida: '—',
          });
        }

        // Horarios compartidos
        try {
          const horariosRef = collection(db, 'HORARIOS');
          const querySnapshot = await getDocs(horariosRef);

          for (const horariosDoc of querySnapshot.docs) {
            const horariosData = horariosDoc.data();

            if (horariosData.sharedWith && horariosData.sharedWith.includes(user.email)) {
              const usuarioDocRef = doc(db, 'usuarios', horariosDoc.id);
              const usuarioDocSnap = await getDoc(usuarioDocRef);

              if (usuarioDocSnap.exists()) {
                const usuarioData = usuarioDocSnap.data();
                const firstName = getFirstName(usuarioData.name || 'Usuario');

                const monday = getMondayOfWeek(new Date());
                const weekStartDate = formatDateInput(monday);
                const savedWeek = horariosData?.semanas?.[weekStartDate];
                const todayScheduleShared = savedWeek?.days?.find((day) => day.date === today);

                if (todayScheduleShared && todayScheduleShared.tipo === 'trabajado') {
                  const start = todayScheduleShared.startTime || '00:00';
                  const end = todayScheduleShared.endTime || '00:00';

                  allSchedules.push({
                    name: firstName,
                    ingreso: start,
                    salida: end,
                  });
                } else {
                  allSchedules.push({
                    name: firstName,
                    ingreso: '—',
                    salida: '—',
                  });
                }
              }
            }
          }

          setTodaySchedules(allSchedules);
        } catch (error) {
          console.error('Error cargando horarios compartidos:', error);
          setTodaySchedules(allSchedules);
        }
      } catch (error) {
        console.error('Error checking today registration:', error);
        setHasRegisteredToday(false);
        setTodaySchedules([]);
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

  const displayName = userName ? formatName(userName) : user.email;

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

      <div className="home-today-schedule">
        <span>Horario para hoy</span>

        <div className="schedule-table">
          {todaySchedules.length > 0 ? (
            todaySchedules.map((item, index) => (
              <div className="schedule-row" key={index}>
                <span>{item.name}</span>
                <span>{item.ingreso}</span>
                <span>{item.salida}</span>
              </div>
            ))
          ) : (
            <div className="schedule-row">
              <span>Sin datos</span>
              <span>—</span>
              <span>—</span>
            </div>
          )}
        </div>
      </div>

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
        <button className="home-button" onClick={() => setShowCopiModal(true)}>
          Recuperar Datos
        </button>
      </div>
    </div>
  );
};

export default HomePage;