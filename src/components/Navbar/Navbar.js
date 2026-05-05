import React, { useState } from 'react';
import { FaBars, FaTimes, FaSignOutAlt } from 'react-icons/fa';
import { toast } from 'react-toastify';
import '../../colors.css';
import './Navbar.css';

const Navbar = ({ setCurrentView, user, userPlan, handleLogout, setShowSubsModal, setShowPlanModal }) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const handleNavClick = (view) => {
    setCurrentView(view);
    setIsOpen(false); // Close menu on mobile after click
  };

  const onLogout = () => {
    handleLogout();
    toast.info('Sesión cerrada');
  };

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <div className="navbar-brand">MyTime</div>
        {userPlan && (
          <button
            type="button"
            className={`navbar-item navbar-plan-button ${userPlan.plan === 'premium' ? 'premium' : 'free'}`}
            onClick={() => userPlan.plan === 'free' && setShowPlanModal(true)}
          >
            {userPlan.plan === 'premium' ? 'Premium' : 'Free'}
          </button>
        )}
      </div>
      <div className={`navbar-menu ${isOpen ? 'is-open' : ''}`}>
        <button type="button" className="navbar-item" onClick={() => handleNavClick('home')}>Inicio</button>
        <button type="button" className="navbar-item" onClick={() => handleNavClick('trabajos')}>Mis Trabajos</button>
        <button type="button" className="navbar-item" onClick={() => handleNavClick('calendar')}>Ver Calendario</button>
        <button type="button" className="navbar-item" onClick={() => handleNavClick('horarios')}>Horarios</button>
        <button type="button" className="navbar-item" onClick={() => handleNavClick('pago')}>Consultar Pago</button>
        {user && user.email === 'jocheangel728@gmail.com' && (
          <button type="button" className="navbar-item" onClick={() => setShowSubsModal(true)}>Usuarios</button>
        )}
        <button type="button" className="navbar-item logout" onClick={onLogout}>
          <FaSignOutAlt /> Cerrar Sesión
        </button>
      </div>
      <div className="navbar-burger" onClick={toggleMenu}>
        {isOpen ? <FaTimes /> : <FaBars />}
      </div>
    </nav>
  );
};

export default Navbar;