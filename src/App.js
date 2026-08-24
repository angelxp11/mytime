import React, { useState, useEffect } from 'react';
import './App.css';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, query, updateDoc } from 'firebase/firestore';
import { auth, db } from './components/server/api';
import Navbar from './components/Navbar/Navbar';
import PlanModal from './funtions/plan';
import Login from './components/Login/Login';
import Register from './components/Register/Register';
import ResetPassword from './components/ResetPassword/ResetPassword';
import HomePage from './components/HomePage/HomePage';
import MisTrabajos from './components/MisTrabajos/MisTrabajos';
import Grupos from './components/grupos/grupos';
import ConsultarPago from './components/ConsultarPago/ConsultarPago';
import CalendarComponent from './components/Calendar/calendar';
import Horario from './components/horario/horario';
import Guias from './components/guias/guias';
import Loading from './components/loading/loading';
import RegisterHours from './components/registerhours/RegisterHours';
import ToastContainer from './components/ToastContainer';
import CopiModal from './funtions/copi';
import SubsModal from './funtions/subs';
import ComentariosModal from './funtions/comentarios';
import Footer from './components/footer/footer';

function App() {
  const [currentView, setCurrentView] = useState('home');
  const [isRegisterHoursOpen, setIsRegisterHoursOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCopiModal, setShowCopiModal] = useState(false);
  const [showSubsModal, setShowSubsModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showComentariosModal, setShowComentariosModal] = useState(false);
  const [pendingCommentsCount, setPendingCommentsCount] = useState(0);
  const [userPlan, setUserPlan] = useState(null);
  const [userCounts, setUserCounts] = useState({ total: 0, premium: 0, free: 0 });

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

  useEffect(() => {
    if (!user) {
      setUserPlan(null);
      return;
    }

    const loadUserPlan = async () => {
      try {
        const usuarioSnap = await getDoc(doc(db, 'usuarios', user.uid));
        if (!usuarioSnap.exists()) {
          setUserPlan({ plan: 'free', expirationDate: null, planRequest: null });
          return;
        }

        const userData = usuarioSnap.data();
        let plan = userData.plan || (userData.membresia ? 'premium' : 'free');
        const expirationDate = userData.fechaExpiracion ? new Date(userData.fechaExpiracion) : null;

        // Verificar si la suscripción ha expirado
        const now = new Date();
        if (expirationDate && expirationDate < now && plan === 'premium') {
          // Actualizar Firestore para marcar como free
          await updateDoc(doc(db, 'usuarios', user.uid), {
            plan: 'free',
            membresia: false,
            fechaExpiracion: null, // Opcional: limpiar la fecha
          });
          plan = 'free';
        }

        setUserPlan({
          plan,
          expirationDate: plan === 'free' ? null : expirationDate,
          planRequest: userData.planRequest || null,
          ocultarFunciones: userData.ocultarFunciones || false,
        });
      } catch (error) {
        console.error('Error cargando plan de usuario:', error);
      }
    };

    loadUserPlan();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setPendingCommentsCount(0);
      return;
    }

    const commentsQuery = query(collection(db, 'COMENTARIOS'));
    const unsubscribe = onSnapshot(
      commentsQuery,
      (snapshot) => {
        const pending = snapshot.docs.reduce((count, docItem) => {
          const data = docItem.data();
          return data.status === 'finalizado' ? count : count + 1;
        }, 0);
        setPendingCommentsCount(pending);
      },
      (error) => {
        console.error('Error escuchando comentarios:', error);
        setPendingCommentsCount(0);
      }
    );

    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user || user.email !== 'jocheangel728@gmail.com') {
      setUserCounts({ total: 0, premium: 0, free: 0 });
      return;
    }

    const usersQuery = query(collection(db, 'usuarios'));
    const unsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        let premium = 0;
        let free = 0;

        snapshot.docs.forEach((docItem) => {
          const data = docItem.data();
          const plan = data.plan || (data.membresia ? 'premium' : 'free');
          if (plan === 'premium') {
            premium += 1;
          } else {
            free += 1;
          }
        });

        setUserCounts({
          total: snapshot.size,
          premium,
          free,
        });
      },
      (error) => {
        console.error('Error escuchando usuarios:', error);
        setUserCounts({ total: 0, premium: 0, free: 0 });
      }
    );

    return unsubscribe;
  }, [user]);

  const handleLogout = async () => {
    setIsLoading(true);
    await auth.signOut();
  };

  const handleSetCurrentView = (view) => {
    if (view === undefined) {
      setIsRegisterHoursOpen(false);
      return;
    }

    if (view === 'registerhours') {
      setIsRegisterHoursOpen(true);
      return;
    }

    setIsRegisterHoursOpen(false);
    setCurrentView(view);
  };

  const handleCloseRegisterHours = () => {
    setIsRegisterHoursOpen(false);
  };

  const renderView = () => {
    let content;

    switch (currentView) {
      case 'login':
        content = <Login setCurrentView={setCurrentView} />;
        break;
      case 'register':
        content = <Register setCurrentView={setCurrentView} />;
        break;
      case 'reset':
        content = <ResetPassword setCurrentView={setCurrentView} />;
        break;
      case 'home':
        content = <HomePage user={user} userPlan={userPlan} setCurrentView={handleSetCurrentView} setShowCopiModal={setShowCopiModal} setShowPlanModal={setShowPlanModal} />;
        break;
      case 'trabajos':
        if (userPlan?.ocultarFunciones) {
          content = <HomePage user={user} userPlan={userPlan} setCurrentView={handleSetCurrentView} setShowCopiModal={setShowCopiModal} setShowPlanModal={setShowPlanModal} />;
        } else {
          content = <MisTrabajos user={user} />;
        }
        break;
      case 'grupos':
        content = <Grupos user={user} />;
        break;
      case 'calendar':
        if (userPlan?.ocultarFunciones) {
          content = <HomePage user={user} userPlan={userPlan} setCurrentView={handleSetCurrentView} setShowCopiModal={setShowCopiModal} setShowPlanModal={setShowPlanModal} />;
        } else {
          content = <CalendarComponent user={user} />;
        }
        break;
      case 'pago':
        if (userPlan?.ocultarFunciones || !userPlan || userPlan.plan !== 'premium') {
          content = <HomePage user={user} userPlan={userPlan} setCurrentView={handleSetCurrentView} setShowCopiModal={setShowCopiModal} setShowPlanModal={setShowPlanModal} />;
        } else {
          content = <ConsultarPago user={user} setCurrentView={handleSetCurrentView} />;
        }
        break;
      case 'horarios':
        if (userPlan?.ocultarFunciones) {
          content = <HomePage user={user} userPlan={userPlan} setCurrentView={handleSetCurrentView} setShowCopiModal={setShowCopiModal} setShowPlanModal={setShowPlanModal} />;
        } else {
          content = <Horario user={user} setCurrentView={handleSetCurrentView} />;
        }
        break;
      case 'guias':
        content = <Guias user={user} setCurrentView={handleSetCurrentView} />;
        break;
      default:
        content = <HomePage user={user} userPlan={userPlan} setCurrentView={handleSetCurrentView} setShowCopiModal={setShowCopiModal} setShowPlanModal={setShowPlanModal} />;
        break;
    }

    if (isRegisterHoursOpen && currentView !== 'login' && currentView !== 'register' && currentView !== 'reset') {
      return (
        <>
          {content}
          <RegisterHours user={user} setCurrentView={handleCloseRegisterHours} previousView={currentView} />
        </>
      );
    }

    return content;
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
      <Navbar
        setCurrentView={handleSetCurrentView}
        user={user}
        userPlan={userPlan}
        handleLogout={handleLogout}
        setShowSubsModal={setShowSubsModal}
        setShowPlanModal={setShowPlanModal}
        setShowComentariosModal={setShowComentariosModal}
        pendingCommentsCount={pendingCommentsCount}
        userCounts={userCounts}
      />
      <main style={{ minHeight: 'calc(100vh - 60px)' }}>
        {renderView()}
      </main>
      {currentView === 'home' && <Footer user={user} />}
      <ToastContainer />
      <PlanModal
        isOpen={showPlanModal}
        onClose={() => setShowPlanModal(false)}
        user={user}
        userPlan={userPlan}
        onRequestCreated={(request) => setUserPlan((prev) => ({ ...prev, planRequest: request }))}
      />
      <CopiModal isOpen={showCopiModal} onClose={() => setShowCopiModal(false)} user={user} />
      <SubsModal isOpen={showSubsModal} onClose={() => setShowSubsModal(false)} user={user} />
      <ComentariosModal isOpen={showComentariosModal} onClose={() => setShowComentariosModal(false)} user={user} />
    </div>
  );
}

export default App;
