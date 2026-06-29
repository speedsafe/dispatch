const { useState, useEffect } = React;

function App() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(false);

  if (loading) {
    return (
      <div className="login-screen">
        <div style={{ textAlign: 'center' }}>
          <div className="login-logo">⏳</div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={(email, role) => { setUser(email); setUserRole(role); }} />;
  }

  if (userRole === 'admin') {
    return <AdminTeamScreen worker={user} onLogout={() => { setUser(null); setUserRole(null); }} />;
  }

  return <WorkerDispatchScreen worker={user} onLogout={() => { setUser(null); setUserRole(null); }} />;
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (email === 'worker@speedsafe.au' && password === 'password') {
      onLogin(email, 'worker');
    } else if (email === 'admin@speedsafe.au' && password === 'password') {
      onLogin(email, 'admin');
    } else {
      alert('Invalid credentials. Use worker@speedsafe.au or admin@speedsafe.au (password: password)');
    }
  };

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="login-logo">SS</div>
        <h1>SpeedSafe Dispatch</h1>
        <p>Field technician GPS tracking & scheduling</p>
        
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="worker@speedsafe.au"
              required
            />
          </div>
          
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              required
            />
          </div>
          
          <button type="submit" className="login-button">Sign In</button>
        </form>

        <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
          <p><strong>Demo Accounts:</strong></p>
          <p>Worker: worker@speedsafe.au</p>
          <p>Admin: admin@speedsafe.au</p>
          <p>Password: password</p>
        </div>
      </div>
    </div>
  );
}

function WorkerDispatchScreen({ worker, onLogout }) {
  const [appointments, setAppointments] = useState([
    { id: 1, time: '9:00 AM', customer: 'Darwin Sandoval', address: '17 Third Ave, Sunshine VIC 3020', phone: '0413533224', service: 'Standard Installation', price: '$280', leaveTime: '8:42 AM', eta: '18 min' },
    { id: 2, time: '11:00 AM', customer: 'Maylene Aquino', address: '8 Sasha, Truganina VIC 3029', phone: '0468832399', service: 'Callout Fee + Custom Service', price: '$150', leaveTime: '10:35 AM', eta: '25 min' },
    { id: 3, time: '2:00 PM', customer: 'Chloe Booking', address: '42 Main St, Footscray VIC 3011', phone: '0412345678', service: 'Hardwire Installation', price: '$180', leaveTime: '1:40 PM', eta: '20 min' },
  ]);
  const [selectedId, setSelectedId] = useState(appointments[0]?.id);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setNotificationsEnabled(true);
    }
  }, []);

  const handleEnableNotifications = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotificationsEnabled(true);
        new Notification('SpeedSafe Dispatch', { body: 'Push notifications enabled!' });
      }
    }
  };

  const handleNavigate = (address) => {
    const encoded = encodeURIComponent(address);
    window.open(`https://maps.google.com/?q=${encoded}`, '_blank');
  };

  const handleCall = (phone) => {
    window.location.href = `tel:${phone}`;
  };

  const selected = appointments.find(a => a.id === selectedId);

  return (
    <div className="app-container">
      <div className="dispatch-header">
        <h1>Dispatch - {worker}</h1>
        <button className="logout-button" onClick={onLogout}>Logout</button>
      </div>

      {selected && (
        <div className="leaving-card">
          <div style={{ fontSize: '12px', opacity: 0.9 }}>LEAVE AT</div>
          <div className="leaving-card-time">{selected.leaveTime}</div>
          <div className="leaving-card-worker">{selected.eta} to {selected.customer}</div>
          {!notificationsEnabled && (
            <button
              style={{
                marginTop: '12px',
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.2)',
                border: '1px solid rgba(255,255,255,0.3)',
                color: 'white',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
              onClick={handleEnableNotifications}
            >
              Enable Push Notifications
            </button>
          )}
        </div>
      )}

      <div className="carousel-container">
        {appointments.map((apt) => (
          <AppointmentDetailCard
            key={apt.id}
            apt={apt}
            isActive={apt.id === selectedId}
            onClick={() => setSelectedId(apt.id)}
            onNavigate={() => handleNavigate(apt.address)}
            onCall={() => handleCall(apt.phone)}
          />
        ))}
      </div>
    </div>
  );
}

function AppointmentDetailCard({ apt, isActive, onClick, onNavigate, onCall }) {
  return (
    <div className={`appointment-card ${isActive ? 'active' : ''}`} onClick={onClick}>
      <div className="appointment-time">{apt.time}</div>
      <div className="appointment-customer">{apt.customer}</div>
      <div className="appointment-address">📍 {apt.address}</div>
      <div className="appointment-service">{apt.service} • {apt.price}</div>
      <div className="appointment-eta">✓ Arrive by {apt.leaveTime}</div>
      <div className="appointment-actions">
        <button className="btn-navigate" onClick={onNavigate}>Navigate</button>
        <button className="btn-call" onClick={onCall}>Call</button>
      </div>
    </div>
  );
}

function AdminTeamScreen({ worker, onLogout }) {
  const [workers, setWorkers] = useState([
    { id: 1, name: 'Darwin Sandoval', status: 'In Transit', lat: -37.805, lng: 144.832, eta: '5 min' },
    { id: 2, name: 'Maylene Aquino', status: 'At Job Site', lat: -37.815, lng: 144.850, eta: 'On-site' },
    { id: 3, name: 'Chloe Booking', status: 'In Transit', lat: -37.790, lng: 144.810, eta: '12 min' },
  ]);
  const [view, setView] = useState('list');

  return (
    <div className="team-screen">
      <div className="team-header">
        <h1>Team Dispatch - {worker}</h1>
        <div>
          <div className="view-toggle">
            <button className={`toggle-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>List</button>
            <button className={`toggle-btn ${view === 'map' ? 'active' : ''}`} onClick={() => setView('map')}>Map</button>
          </div>
        </div>
        <button className="logout-button" onClick={onLogout}>Logout</button>
      </div>

      {view === 'map' ? (
        <MapComponent workers={workers} />
      ) : (
        <div className="team-list">
          {workers.map((w) => (
            <div key={w.id} className="worker-card">
              <div className="worker-status">
                <div className="worker-name">{w.name}</div>
                <div className={`status-badge ${w.status === 'In Transit' ? 'transit' : ''}`}>
                  {w.status}
                </div>
              </div>
              <div className="worker-eta">ETA: {w.eta}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MapComponent({ workers }) {
  useEffect(() => {
    if (mapboxgl.accessToken) {
      const map = new mapboxgl.Map({
        container: 'team-map',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [144.82, -37.80],
        zoom: 12
      });

      workers.forEach((w) => {
        new mapboxgl.Marker({ color: w.status === 'In Transit' ? '#f59e0b' : '#10b981' })
          .setLngLat([w.lng, w.lat])
          .setPopup(new mapboxgl.Popup().setHTML(`<strong>${w.name}</strong><br>${w.status}<br>ETA: ${w.eta}`))
          .addTo(map);
      });
    }
  }, [workers]);

  return <div id="team-map" className="team-map"></div>;
}

ReactDOM.render(<App />, document.getElementById('root'));
