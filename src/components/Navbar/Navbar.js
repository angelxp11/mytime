import React, { useState, useEffect } from 'react';
import { FaBars, FaTimes, FaSignOutAlt } from 'react-icons/fa';
import { FiClock } from 'react-icons/fi';
import { toast } from 'react-toastify';
import '../../colors.css';
import './Navbar.css';

const Navbar = ({ setCurrentView, user, userPlan, handleLogout, setShowSubsModal, setShowPlanModal, setShowComentariosModal, pendingCommentsCount, userCounts }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ocultarFunciones = userPlan?.ocultarFunciones;

  // Bloquear scroll del body cuando el menú está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const toggleMenu = () => setIsOpen((prev) => !prev);
  const closeMenu  = () => setIsOpen(false);

  const isSubscriptionExpired = () => {
    if (!userPlan) return true;
    if (userPlan.plan !== 'premium') return true;
    if (!userPlan.expirationDate) return false;
    return new Date(userPlan.expirationDate) < new Date();
  };

  const canRegisterHours = () =>
    userPlan?.plan === 'premium' && !isSubscriptionExpired();

  const handleNavClick = (view) => {
    if (view === 'pago' && isSubscriptionExpired()) {
      setShowPlanModal(true);
    } else {
      setCurrentView(view);
    }
    closeMenu();
  };

  const handleRegisterClick = () => {
    if (canRegisterHours()) {
      setCurrentView('registerhours');
    } else {
      setShowPlanModal(true);
    }
    closeMenu();
  };

  const onLogout = () => {
    handleLogout();
    toast.info('Sesión cerrada');
    closeMenu();
  };

  return (
    <>
      <nav className="navbar">
        <div className="navbar-left">
          <div
            className="navbar-brand"
            role="button"
            tabIndex={0}
            onClick={() => handleNavClick('home')}
            onKeyPress={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                handleNavClick('home');
              }
            }}
          >
            MyTime
          </div>

          {userPlan && !ocultarFunciones && (
            <button
              type="button"
              className={`navbar-item navbar-plan-button ${userPlan.plan === 'premium' ? 'premium' : 'free'}`}
              onClick={() => userPlan.plan === 'free' && setShowPlanModal(true)}
            >
              {userPlan.plan === 'premium' ? 'Premium' : 'Free'}
            </button>
          )}
        </div>

        {/* Overlay oscuro al abrir el menú */}
        <div
          className={`navbar-overlay ${isOpen ? 'is-open' : ''}`}
          onClick={closeMenu}
          aria-hidden="true"
        />

        <div className={`navbar-menu ${isOpen ? 'is-open' : ''}`}>
          {!ocultarFunciones && (
            <>
              <button
                type="button"
                className="navbar-item register-btn"
                onClick={handleRegisterClick}
              >
                <FiClock size={15} />
                Registrar Hora
              </button>

              <button type="button" className="navbar-item" onClick={() => handleNavClick('trabajos')}>
                Mis Trabajos
              </button>
              <button type="button" className="navbar-item" onClick={() => handleNavClick('calendar')}>
                Calendario
              </button>
              <button type="button" className="navbar-item" onClick={() => handleNavClick('horarios')}>
                Horarios
              </button>
              <button type="button" className="navbar-item" onClick={() => handleNavClick('pago')}>
                Consultar Pago
              </button>
            </>
          )}

          <button type="button" className="navbar-item" onClick={() => handleNavClick('home')}>
            Inicio
          </button>
          <button type="button" className="navbar-item" onClick={() => handleNavClick('grupos')}>
            Grupos
          </button>

          {user && user.email === 'jocheangel728@gmail.com' && (
            <>
              <button
                type="button"
                className="navbar-item requests-btn"
                onClick={() => { setShowComentariosModal(true); closeMenu(); }}
              >
                Solicitudes
                {pendingCommentsCount > 0 && (
                  <span className="navbar-badge">{pendingCommentsCount}</span>
                )}
              </button>
              <button
                type="button"
                className="navbar-item users-btn"
                onClick={() => { setShowSubsModal(true); closeMenu(); }}
              >
                Usuarios
                <span className="users-counts">
                  <span className="users-count-badge users-total">{userCounts.total}</span>
                  <span className="users-count-badge users-premium">{userCounts.premium}</span>
                  <span className="users-count-badge users-free">{userCounts.free}</span>
                </span>
              </button>
            </>
          )}

          <button type="button" className="navbar-item logout" onClick={onLogout}>
            <FaSignOutAlt size={13} /> Cerrar Sesión
          </button>
        </div>

        <button
          type="button"
          className="navbar-burger"
          onClick={toggleMenu}
          aria-label={isOpen ? 'Cerrar menú' : 'Abrir menú'}
        >
          {isOpen ? <FaTimes /> : <FaBars />}
        </button>
      </nav>

      {/* Espaciador para que el contenido no quede bajo el navbar fijo */}
      <div className="navbar-spacer" />
    </>
  );
};

export default Navbar;