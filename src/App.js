import React, { useState, useEffect } from 'react';
import './App.css';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './components/server/api';
import Navbar from './components/Navbar/Navbar';
import PlanModal from './funtions/plan';
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
import SubsModal from './funtions/subs';
import Footer from './components/footer/footer';

function App() {
  const [currentView, setCurrentView] = useState('home');
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCopiModal, setShowCopiModal] = useState(false);
  const [showSubsModal, setShowSubsModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [userPlan, setUserPlan] = useState(null);

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
        });
      } catch (error) {
        console.error('Error cargando plan de usuario:', error);
      }
    };

    loadUserPlan();
  }, [user]);

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
        return <HomePage user={user} userPlan={userPlan} setCurrentView={setCurrentView} setShowCopiModal={setShowCopiModal} setShowPlanModal={setShowPlanModal} />;
      case 'trabajos':
        return <MisTrabajos user={user} />;
      case 'calendar':
        return <CalendarComponent user={user} />;
      case 'pago':
        return <ConsultarPago user={user} setCurrentView={setCurrentView} />;
      case 'registerhours':
        if (!userPlan || userPlan.plan !== 'premium') {
          return <HomePage user={user} userPlan={userPlan} setCurrentView={setCurrentView} setShowCopiModal={setShowCopiModal} setShowPlanModal={setShowPlanModal} />;
        }
        return <RegisterHours user={user} setCurrentView={setCurrentView} />;
      case 'horarios':
        return <Horario user={user} setCurrentView={setCurrentView} />;
      default:
        return <HomePage user={user} userPlan={userPlan} setCurrentView={setCurrentView} setShowCopiModal={setShowCopiModal} setShowPlanModal={setShowPlanModal} />;
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
      <Navbar
        setCurrentView={setCurrentView}
        user={user}
        userPlan={userPlan}
        handleLogout={handleLogout}
        setShowSubsModal={setShowSubsModal}
        setShowPlanModal={setShowPlanModal}
      />
      <main style={{ minHeight: 'calc(100vh - 60px)' }}>
        {renderView()}
      </main>
      <Footer user={user} />
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
    </div>
  );
}

export default App;
