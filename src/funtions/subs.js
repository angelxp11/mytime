import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../components/server/api';
import './subs.css';

const SubsModal = ({ isOpen, onClose, user }) => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingUsers, setEditingUsers] = useState({});
  const [filter, setFilter] = useState('all'); // 'all', 'active', 'inactive', 'requests'

  useEffect(() => {
    if (isOpen && user && user.email === 'jocheangel728@gmail.com') {
      fetchUsers();
    }
  }, [isOpen, user]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'usuarios'));
      const usersData = [];
      querySnapshot.forEach((doc) => {
        usersData.push({ id: doc.id, ...doc.data() });
      });
      setUsers(usersData);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
    setIsLoading(false);
  };

  const handleMembershipToggle = (userId, currentValue) => {
    setEditingUsers(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        membresia: !currentValue
      }
    }));
  };

  const handleExpirationChange = (userId, newDate) => {
    setEditingUsers(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        fechaExpiracion: newDate
      }
    }));
  };

  const saveUserChanges = async (userId) => {
    const changes = editingUsers[userId];
    if (!changes) return;

    // Si se activa la membresía, cambiar plan a premium
    if (changes.membresia === true) {
      changes.plan = 'premium';
    }
    // Si se desactiva la membresía, cambiar plan a free
    if (changes.membresia === false) {
      changes.plan = 'free';
    }

    try {
      const userRef = doc(db, 'usuarios', userId);
      await updateDoc(userRef, changes);

      // Update local state
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, ...changes } : u
      ));

      // Clear editing state for this user
      setEditingUsers(prev => {
        const newState = { ...prev };
        delete newState[userId];
        return newState;
      });

      alert('Cambios guardados exitosamente');
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Error al guardar los cambios');
    }
  };

  const getEditedValue = (userId, field, defaultValue) => {
    return editingUsers[userId]?.[field] ?? defaultValue;
  };

  const hasChanges = (userId) => {
    return !!editingUsers[userId];
  };

  const getPlanStatus = (userData) => {
    return userData.plan || (userData.membresia ? 'premium' : 'free');
  };

  const getPlanRequest = (userData) => {
    return userData.planRequest || null;
  };

  const acceptPlanRequest = async (userId, planRequest, previousMonths = 0) => {
    if (!planRequest) return;

    const months = planRequest.months || 1;
    const expirationDate = new Date();
    expirationDate.setMonth(expirationDate.getMonth() + months);

    try {
      const userRef = doc(db, 'usuarios', userId);
      await updateDoc(userRef, {
        plan: 'premium',
        membresia: true,
        fechaExpiracion: expirationDate.toISOString(),
        planRequest: {
          ...planRequest,
          status: 'accepted',
          acceptedAt: new Date().toISOString(),
        },
        mesesComprados: previousMonths + months,
      });

      setUsers(prev => prev.map(u =>
        u.id === userId
          ? {
              ...u,
              plan: 'premium',
              membresia: true,
              fechaExpiracion: expirationDate.toISOString(),
              planRequest: {
                ...planRequest,
                status: 'accepted',
                acceptedAt: new Date().toISOString(),
              },
              mesesComprados: previousMonths + months,
            }
          : u
      ));

      alert('Solicitud aceptada y membresía activada.');
    } catch (error) {
      console.error('Error aceptando solicitud de plan:', error);
      alert('No se pudo aceptar la solicitud. Intenta de nuevo.');
    }
  };

  const getFilteredUsers = () => {
    return users.filter(userData => {
      const planStatus = getPlanStatus(userData);
      if (filter === 'active') return planStatus === 'premium';
      if (filter === 'inactive') return planStatus !== 'premium';
      if (filter === 'requests') return getPlanRequest(userData)?.status === 'pending';
      return true; // 'all'
    });
  };

  if (!isOpen || !user || user.email !== 'jocheangel728@gmail.com') {
    return null;
  }

  return (
    <div className="subs-modal-overlay">
      <div className="subs-modal-content">
        <div className="subs-modal-header">
          <h2>Usuarios y Membresías</h2>
          <button className="subs-close-button" onClick={onClose}>×</button>
        </div>
        <div className="subs-modal-body">
          {isLoading ? (
            <p>Cargando usuarios...</p>
          ) : (
            <>
              <div className="filter-section">
                <label className="filter-label">Filtrar por estado:</label>
                <div className="filter-buttons">
                  <button
                    className={`filter-button ${filter === 'all' ? 'active' : ''}`}
                    onClick={() => setFilter('all')}
                  >
                    Todas
                  </button>
                  <button
                    className={`filter-button ${filter === 'active' ? 'active' : ''}`}
                    onClick={() => setFilter('active')}
                  >
                    Activas
                  </button>
                  <button
                    className={`filter-button ${filter === 'inactive' ? 'active' : ''}`}
                    onClick={() => setFilter('inactive')}
                  >
                    Inactivas
                  </button>
                  <button
                    className={`filter-button ${filter === 'requests' ? 'active' : ''}`}
                    onClick={() => setFilter('requests')}
                  >
                    Solicitudes
                  </button>
                </div>
              </div>
              <div className="users-list">
                {getFilteredUsers().map((userData) => (
                  <div key={userData.id} className="user-item">
                    <div className="user-info">
                      <span className="user-name">{userData.name || 'Sin nombre'}</span>
                      <span className="user-email">{userData.email}</span>
                    </div>
                    <div className="membership-info">
                      <span className={`membership-status ${getPlanStatus(userData) === 'premium' ? 'premium' : 'free'}`}>
                        {getPlanStatus(userData) === 'premium' ? 'Premium' : 'Free'}
                      </span>
                      <span className="expiration-date">
                        {userData.fechaExpiracion ? new Date(userData.fechaExpiracion).toLocaleDateString() : 'Sin fecha'}
                      </span>
                      <div className="membership-controls">
                        <div className="membership-toggle">
                          <span className="toggle-label">Membresía:</span>
                          <label className="toggle-switch">
                            <input
                              type="checkbox"
                              checked={getEditedValue(userData.id, 'membresia', userData.membresia) || false}
                              onChange={() => handleMembershipToggle(userData.id, getEditedValue(userData.id, 'membresia', userData.membresia))}
                            />
                            <span className="slider"></span>
                          </label>
                        </div>
                        <div className="expiration-input">
                          <span className="expiration-label">Expiración:</span>
                          <input
                            type="date"
                            className="expiration-date-input"
                            value={getEditedValue(userData.id, 'fechaExpiracion', userData.fechaExpiracion) ?
                              new Date(getEditedValue(userData.id, 'fechaExpiracion', userData.fechaExpiracion)).toISOString().split('T')[0] :
                              ''}
                            onChange={(e) => handleExpirationChange(userData.id, e.target.value ? new Date(e.target.value).toISOString() : null)}
                          />
                        </div>
                        {hasChanges(userData.id) && (
                          <button
                            className="save-button"
                            onClick={() => saveUserChanges(userData.id)}
                          >
                            Guardar
                          </button>
                        )}
                      </div>
                      {getPlanRequest(userData)?.status === 'pending' && (
                        <div className="request-card">
                          <div>
                            <span className="request-label">Solicitud pendiente:</span>
                            <span>{getPlanRequest(userData).months || 1} mes(es)</span>
                          </div>
                          <div>
                            <span className="request-label">Precio:</span>
                            <span>${getPlanRequest(userData).price || 0}</span>
                          </div>
                          <button
                            className="accept-request-button"
                            onClick={() => acceptPlanRequest(userData.id, getPlanRequest(userData), userData.mesesComprados || 0)}
                          >
                            Aceptar solicitud
                          </button>
                        </div>
                      )}
                      {userData.mesesComprados > 0 && (
                        <div className="request-card">
                          <span className="request-label">Meses comprados:</span>
                          <span>{userData.mesesComprados}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubsModal;