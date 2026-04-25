import React, { useState } from 'react';
import { collection, query, where, getDocs, addDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../components/server/api';
import { showToast } from '../components/ToastContainer';
import './copi.css';

const CopiModal = ({ isOpen, onClose, user }) => {
  const [oldEmail, setOldEmail] = useState('');
  const [searchedUser, setSearchedUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async () => {
    if (!oldEmail) {
      showToast('Por favor, ingresa el email', 'error');
      return;
    }

    if (oldEmail !== user.email) {
      showToast('El email debe ser el mismo que tu cuenta actual', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const q = query(collection(db, 'usuarios'), where('email', '==', oldEmail));
      const querySnapshot = await getDocs(q);

      const users = [];
      querySnapshot.forEach((doc) => {
        if (doc.id !== user.uid) {
          users.push({ uid: doc.id, ...doc.data() });
        }
      });

      if (users.length === 0) {
        showToast('No se encontraron datos para copiar con este email', 'error');
        setSearchedUser(null);
      } else if (users.length === 1) {
        const foundUser = users[0];
        const oldUID = foundUser.uid;

        // Obtener información detallada de cada colección
        const horarios = [];
        const horasTrabajadas = [];
        const trabajos = [];
        
        try {
          // Obtener horarios
          const horariosRef = doc(db, 'HORARIOS', oldUID);
          const horariosSnap = await getDoc(horariosRef);
          if (horariosSnap.exists()) {
            const data = horariosSnap.data();
            if (data && typeof data === 'object') {
              Object.keys(data).forEach(key => {
                if (data[key] && data[key].fecha) {
                  horarios.push(data[key].fecha);
                }
              });
            }
          }

          // Obtener horas trabajadas
          const horasRef = doc(db, 'horasTrabajadas', oldUID);
          const horasSnap = await getDoc(horasRef);
          if (horasSnap.exists()) {
            const data = horasSnap.data();
            if (data && typeof data === 'object') {
              Object.keys(data).forEach(key => {
                if (data[key] && data[key].hora) {
                  horasTrabajadas.push(data[key].hora);
                }
              });
            }
          }

          // Obtener trabajos
          const trabajosQ = query(collection(db, 'trabajos'), where('userId', '==', oldUID));
          const trabajosSnap = await getDocs(trabajosQ);
          trabajosSnap.forEach(doc => {
            const data = doc.data();
            if (data.nombre) {
              trabajos.push(data.nombre);
            }
          });
        } catch (error) {
          console.error('Error obteniendo datos detallados:', error);
        }

        const userWithDetails = {
          ...foundUser,
          _horarios: horarios.sort(),
          _horasTrabajadas: horasTrabajadas.sort(),
          _trabajos: trabajos
        };

        setSearchedUser(userWithDetails);
        showToast('Usuario encontrado', 'success');
      } else {
        showToast('Se encontraron múltiples usuarios, contacta soporte', 'error');
      }
    } catch (error) {
      console.error('Error buscando usuario:', error);
      showToast('Error al buscar usuario', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!searchedUser) return;

    setIsLoading(true);
    const oldUID = searchedUser.uid;

    try {
      // Collections to copy
      const collections = ['HORARIOS', 'horasTrabajadas', 'trabajos', 'usuarios'];

      for (const collName of collections) {
        if (collName === 'trabajos') {
          // trabajos has multiple docs per user, with userId field
          const q = query(collection(db, collName), where('userId', '==', oldUID));
          const querySnapshot = await getDocs(q);

          for (const document of querySnapshot.docs) {
            const data = document.data();
            // Create new document with new UID
            await addDoc(collection(db, collName), {
              ...data,
              userId: user.uid,
              copiedFrom: oldUID,
              copiedAt: new Date(),
            });
          }
        } else {
          // Other collections have doc ID = user.uid
          const docRef = doc(db, collName, oldUID);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            // Create new document with new UID as doc ID
            await setDoc(doc(db, collName, user.uid), {
              ...data,
              copiedFrom: oldUID,
              copiedAt: new Date(),
            });
          }
        }
      }

      showToast('Datos copiados exitosamente', 'success');
      onClose();
      setOldEmail('');
      setSearchedUser(null);
    } catch (error) {
      console.error('Error copiando datos:', error);
      showToast('Error al copiar los datos', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="copi-modal-overlay" onClick={onClose}>
      <div className="copi-modal" onClick={(e) => e.stopPropagation()}>
        <div className="register-hours-header">
          <div className="register-hours-title">
            <h2>Recuperar Datos</h2>
            <p>Migra tu información de una cuenta anterior</p>
          </div>
          <button className="register-hours-close" onClick={onClose}>✕</button>
        </div>

        {!searchedUser ? (
          <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }}>
            <div className="register-hours-form">
              <div className="register-hours-field">
                <label htmlFor="oldEmail">Email a recuperar</label>
                <input
                  type="email"
                  id="oldEmail"
                  value={oldEmail}
                  onChange={(e) => setOldEmail(e.target.value)}
                  placeholder="ingresa tu email anterior"
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="register-hours-actions">
                <button type="button" className="register-hours-secondary" onClick={onClose}>
                  Cancelar
                </button>
                <button type="submit" className="register-hours-submit" disabled={isLoading}>
                  {isLoading ? '⏳ Buscando...' : '🔍 Buscar Usuario'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="register-hours-form">
            <div style={{ 
              padding: '18px 20px', 
              borderRadius: '18px', 
              border: '1px solid rgba(34, 197, 94, 0.24)',
              background: 'rgba(34, 197, 94, 0.08)',
              color: '#e2e8f0'
            }}>
              <p style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#cbd5e1' }}>Usuario encontrado</p>
              <p style={{ margin: 0, fontSize: '1.3rem', fontWeight: '700', color: '#22c55e' }}>
                👤 {searchedUser.name || searchedUser.displayName || 'Sin nombre'}
              </p>
              {searchedUser.email && (
                <p style={{ margin: '8px 0 0 0', fontSize: '0.9rem', color: '#94a3b8' }}>
                  {searchedUser.email}
                </p>
              )}
            </div>

            <div className="register-hours-alert">
              <p>📋 <strong style={{ color: '#e2e8f0' }}>Datos que se copiarán:</strong></p>
              <ul style={{ 
                margin: '12px 0 0 0', 
                paddingLeft: '24px',
                color: '#cbd5e1',
                fontSize: '0.95rem',
                lineHeight: '1.6'
              }}>
                <li>Horarios laborales</li>
                <li>Horas trabajadas</li>
                <li>Trabajos registrados</li>
                <li>Información de usuario</li>
              </ul>
            </div>

            <div style={{
              padding: '18px 20px',
              borderRadius: '18px',
              border: '1px solid rgba(148, 163, 184, 0.14)',
              background: 'rgba(148, 163, 184, 0.06)',
              color: '#cbd5e1'
            }}>
              <p style={{ margin: 0, fontSize: '0.95rem' }}>
                ℹ️ <strong style={{ color: '#e2e8f0' }}>Nota:</strong> Se conservarán tus datos actuales y se agregarán los del usuario anterior.
              </p>
            </div>

            <div className="register-hours-actions">
              <button 
                type="button" 
                className="register-hours-secondary" 
                onClick={() => {
                  setSearchedUser(null);
                  setOldEmail('');
                }}
                disabled={isLoading}
              >
                Buscar otro
              </button>
              <button 
                type="button" 
                className="register-hours-submit" 
                onClick={handleCopy} 
                disabled={isLoading}
              >
                {isLoading ? '⏳ Copiando...' : '✓ Copiar Datos'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CopiModal;