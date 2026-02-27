/*
 * ─────────────────────────────────────────────────────────────
 *  DATABASE SEED SCRIPT
 * ─────────────────────────────────────────────────────────────
 *  PURPOSE:
 *    Populates the database with sample data for development.
 *    Creates:
 *      - 1 admin user
 *      - 1 regular user
 *      - 26 flight inventory items (real-world routes)
 *      - 26 hotel inventory items (real-world hotels)
 *
 *  USAGE:
 *    npm run seed
 *
 *  WARNING:
 *    This script DROPS all existing data before inserting.
 *
 *  CONNECTED TO:
 *    - server/config/db.js        → MongoDB connection
 *    - server/models/User.js      → User model
 *    - server/models/Inventory.js → Inventory model
 * ─────────────────────────────────────────────────────────────
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const config = require('../config/env');
const User = require('../models/User');
const Inventory = require('../models/Inventory');
const Booking = require('../models/Booking');
const Task = require('../models/Task');
const ShareLink = require('../models/ShareLink');

const users = [
  {
    name: 'Admin User',
    email: 'admin@booking.com',
    password: 'admin123',
    role: 'admin',
  },
  {
    name: 'John Traveler',
    email: 'john@example.com',
    password: 'user123',
    role: 'user',
  },
];

/* ─── ALL PRICES ARE IN USD CENTS (e.g. 25000 = $250.00) ──── */

const inventory = [

  /* ═══════════════════════════════════════════════════════════
     FLIGHTS – 26 real-world routes
     ═══════════════════════════════════════════════════════════ */

  // 1. New York to London – Business
  {
    type: 'flight',
    title: 'New York → London Business',
    description: 'Direct transatlantic flight JFK to Heathrow.',
    category: 'business',
    price: 245000,
    origin: 'JFK', destination: 'LHR',
    airline: 'British Airways', flightNumber: 'BA178',
    departureDate: new Date('2026-04-15T08:00:00Z'),
    arrivalDate: new Date('2026-04-15T20:00:00Z'),
    totalUnits: 24, availableUnits: 24,
  },

  // 2. Los Angeles to Tokyo – Economy
  {
    type: 'flight',
    title: 'Los Angeles → Tokyo Economy',
    description: 'LAX to Narita with one-stop via Honolulu.',
    category: 'economy',
    price: 89900,
    origin: 'LAX', destination: 'NRT',
    airline: 'Japan Airlines', flightNumber: 'JL015',
    departureDate: new Date('2026-05-01T14:30:00Z'),
    arrivalDate: new Date('2026-05-02T18:45:00Z'),
    totalUnits: 180, availableUnits: 180,
  },

  // 3. Dubai to Singapore – First Class
  {
    type: 'flight',
    title: 'Dubai → Singapore First Class',
    description: 'Ultra-luxury private suites with shower spa.',
    category: 'first',
    price: 620000,
    origin: 'DXB', destination: 'SIN',
    airline: 'Emirates', flightNumber: 'EK354',
    departureDate: new Date('2026-03-20T22:00:00Z'),
    arrivalDate: new Date('2026-03-21T10:15:00Z'),
    totalUnits: 8, availableUnits: 8,
  },

  // 4. Chicago to Miami – Economy
  {
    type: 'flight',
    title: 'Chicago → Miami Economy',
    description: 'Short domestic hop with free carry-on.',
    category: 'economy',
    price: 12500,
    origin: 'ORD', destination: 'MIA',
    airline: 'American Airlines', flightNumber: 'AA1247',
    departureDate: new Date('2026-06-10T06:00:00Z'),
    arrivalDate: new Date('2026-06-10T10:30:00Z'),
    totalUnits: 200, availableUnits: 200,
  },

  // 5. Paris to Rome – Business
  {
    type: 'flight',
    title: 'Paris → Rome Business',
    description: 'Quick European business-class service.',
    category: 'business',
    price: 45000,
    origin: 'CDG', destination: 'FCO',
    airline: 'Air France', flightNumber: 'AF1404',
    departureDate: new Date('2026-04-22T11:00:00Z'),
    arrivalDate: new Date('2026-04-22T13:15:00Z'),
    totalUnits: 30, availableUnits: 30,
  },

  // 6. Sydney to Auckland – Economy
  {
    type: 'flight',
    title: 'Sydney → Auckland Economy',
    description: 'Trans-Tasman flight with ocean views.',
    category: 'economy',
    price: 22000,
    origin: 'SYD', destination: 'AKL',
    airline: 'Qantas', flightNumber: 'QF145',
    departureDate: new Date('2026-07-05T07:30:00Z'),
    arrivalDate: new Date('2026-07-05T12:45:00Z'),
    totalUnits: 150, availableUnits: 150,
  },

  // 7. London to New York – Economy
  {
    type: 'flight',
    title: 'London → New York Economy',
    description: 'Heathrow to JFK direct with Virgin Atlantic.',
    category: 'economy',
    price: 55000,
    origin: 'LHR', destination: 'JFK',
    airline: 'Virgin Atlantic', flightNumber: 'VS3',
    departureDate: new Date('2026-05-10T09:30:00Z'),
    arrivalDate: new Date('2026-05-10T12:30:00Z'),
    totalUnits: 220, availableUnits: 220,
  },

  // 8. San Francisco to Seoul – Business
  {
    type: 'flight',
    title: 'San Francisco → Seoul Business',
    description: 'SFO to Incheon with Korean Air prestige class.',
    category: 'business',
    price: 310000,
    origin: 'SFO', destination: 'ICN',
    airline: 'Korean Air', flightNumber: 'KE024',
    departureDate: new Date('2026-06-20T13:00:00Z'),
    arrivalDate: new Date('2026-06-21T17:30:00Z'),
    totalUnits: 28, availableUnits: 28,
  },

  // 9. Mumbai to Dubai – Economy
  {
    type: 'flight',
    title: 'Mumbai → Dubai Economy',
    description: 'BOM to DXB short-haul with Air India.',
    category: 'economy',
    price: 18000,
    origin: 'BOM', destination: 'DXB',
    airline: 'Air India', flightNumber: 'AI983',
    departureDate: new Date('2026-04-05T02:00:00Z'),
    arrivalDate: new Date('2026-04-05T04:30:00Z'),
    totalUnits: 240, availableUnits: 240,
  },

  // 10. Bangkok to Bali – Economy
  {
    type: 'flight',
    title: 'Bangkok → Bali Economy',
    description: 'BKK to Denpasar with Thai AirAsia.',
    category: 'economy',
    price: 15000,
    origin: 'BKK', destination: 'DPS',
    airline: 'Thai AirAsia', flightNumber: 'FD397',
    departureDate: new Date('2026-08-12T10:00:00Z'),
    arrivalDate: new Date('2026-08-12T15:30:00Z'),
    totalUnits: 180, availableUnits: 180,
  },

  // 11. Istanbul to Barcelona – Business
  {
    type: 'flight',
    title: 'Istanbul → Barcelona Business',
    description: 'IST to BCN with Turkish Airlines business.',
    category: 'business',
    price: 72000,
    origin: 'IST', destination: 'BCN',
    airline: 'Turkish Airlines', flightNumber: 'TK1853',
    departureDate: new Date('2026-05-18T16:00:00Z'),
    arrivalDate: new Date('2026-05-18T19:00:00Z'),
    totalUnits: 20, availableUnits: 20,
  },

  // 12. Toronto to Vancouver – Economy
  {
    type: 'flight',
    title: 'Toronto → Vancouver Economy',
    description: 'Cross-Canada domestic with Air Canada.',
    category: 'economy',
    price: 21000,
    origin: 'YYZ', destination: 'YVR',
    airline: 'Air Canada', flightNumber: 'AC103',
    departureDate: new Date('2026-07-22T08:00:00Z'),
    arrivalDate: new Date('2026-07-22T10:30:00Z'),
    totalUnits: 160, availableUnits: 160,
  },

  // 13. Frankfurt to Beijing – First Class
  {
    type: 'flight',
    title: 'Frankfurt → Beijing First Class',
    description: 'Lufthansa First Class FRA to PEK.',
    category: 'first',
    price: 750000,
    origin: 'FRA', destination: 'PEK',
    airline: 'Lufthansa', flightNumber: 'LH720',
    departureDate: new Date('2026-09-01T14:00:00Z'),
    arrivalDate: new Date('2026-09-02T06:00:00Z'),
    totalUnits: 6, availableUnits: 6,
  },

  // 14. Singapore to Melbourne – Business
  {
    type: 'flight',
    title: 'Singapore → Melbourne Business',
    description: 'SIN to MEL with Singapore Airlines.',
    category: 'business',
    price: 185000,
    origin: 'SIN', destination: 'MEL',
    airline: 'Singapore Airlines', flightNumber: 'SQ237',
    departureDate: new Date('2026-06-15T00:30:00Z'),
    arrivalDate: new Date('2026-06-15T10:45:00Z'),
    totalUnits: 36, availableUnits: 36,
  },

  // 15. Mexico City to Cancun – Economy
  {
    type: 'flight',
    title: 'Mexico City → Cancun Economy',
    description: 'MEX to CUN short domestic with Volaris.',
    category: 'economy',
    price: 8500,
    origin: 'MEX', destination: 'CUN',
    airline: 'Volaris', flightNumber: 'Y4912',
    departureDate: new Date('2026-07-01T07:00:00Z'),
    arrivalDate: new Date('2026-07-01T09:30:00Z'),
    totalUnits: 190, availableUnits: 190,
  },

  // 16. Cairo to Athens – Economy
  {
    type: 'flight',
    title: 'Cairo → Athens Economy',
    description: 'CAI to ATH with EgyptAir.',
    category: 'economy',
    price: 28000,
    origin: 'CAI', destination: 'ATH',
    airline: 'EgyptAir', flightNumber: 'MS747',
    departureDate: new Date('2026-05-25T12:00:00Z'),
    arrivalDate: new Date('2026-05-25T15:00:00Z'),
    totalUnits: 140, availableUnits: 140,
  },

  // 17. Johannesburg to Nairobi – Business
  {
    type: 'flight',
    title: 'Johannesburg → Nairobi Business',
    description: 'JNB to NBO with Kenya Airways.',
    category: 'business',
    price: 95000,
    origin: 'JNB', destination: 'NBO',
    airline: 'Kenya Airways', flightNumber: 'KQ761',
    departureDate: new Date('2026-08-20T09:00:00Z'),
    arrivalDate: new Date('2026-08-20T14:30:00Z'),
    totalUnits: 18, availableUnits: 18,
  },

  // 18. Doha to London – First Class
  {
    type: 'flight',
    title: 'Doha → London First Class',
    description: 'Qatar Airways QSuite from DOH to LHR.',
    category: 'first',
    price: 890000,
    origin: 'DOH', destination: 'LHR',
    airline: 'Qatar Airways', flightNumber: 'QR3',
    departureDate: new Date('2026-04-30T08:00:00Z'),
    arrivalDate: new Date('2026-04-30T13:30:00Z'),
    totalUnits: 8, availableUnits: 8,
  },

  // 19. Sao Paulo to Buenos Aires – Economy
  {
    type: 'flight',
    title: 'Sao Paulo → Buenos Aires Economy',
    description: 'GRU to EZE with LATAM Airlines.',
    category: 'economy',
    price: 19500,
    origin: 'GRU', destination: 'EZE',
    airline: 'LATAM', flightNumber: 'LA8060',
    departureDate: new Date('2026-06-05T22:00:00Z'),
    arrivalDate: new Date('2026-06-06T01:30:00Z'),
    totalUnits: 200, availableUnits: 200,
  },

  // 20. Hong Kong to Taipei – Economy
  {
    type: 'flight',
    title: 'Hong Kong → Taipei Economy',
    description: 'HKG to TPE with Cathay Pacific.',
    category: 'economy',
    price: 16000,
    origin: 'HKG', destination: 'TPE',
    airline: 'Cathay Pacific', flightNumber: 'CX564',
    departureDate: new Date('2026-09-10T11:00:00Z'),
    arrivalDate: new Date('2026-09-10T12:45:00Z'),
    totalUnits: 170, availableUnits: 170,
  },

  // 21-26: Additional flights
  {
    type: 'flight', title: 'Amsterdam to New York Economy',
    description: 'AMS to JFK with KLM Royal Dutch.',
    category: 'economy', price: 62000,
    origin: 'AMS', destination: 'JFK',
    airline: 'KLM', flightNumber: 'KL641',
    departureDate: new Date('2026-05-15T10:00:00Z'),
    arrivalDate: new Date('2026-05-15T13:00:00Z'),
    totalUnits: 250, availableUnits: 250,
  },
  {
    type: 'flight', title: 'Delhi to Bangkok Economy',
    description: 'DEL to BKK with IndiGo.',
    category: 'economy', price: 14000,
    origin: 'DEL', destination: 'BKK',
    airline: 'IndiGo', flightNumber: '6E1053',
    departureDate: new Date('2026-06-28T04:00:00Z'),
    arrivalDate: new Date('2026-06-28T09:30:00Z'),
    totalUnits: 180, availableUnits: 180,
  },
  {
    type: 'flight', title: 'Madrid to Lisbon Business',
    description: 'MAD to LIS with Iberia.',
    category: 'business', price: 32000,
    origin: 'MAD', destination: 'LIS',
    airline: 'Iberia', flightNumber: 'IB3100',
    departureDate: new Date('2026-04-18T15:00:00Z'),
    arrivalDate: new Date('2026-04-18T15:55:00Z'),
    totalUnits: 22, availableUnits: 22,
  },
  {
    type: 'flight', title: 'Zurich to Maldives Business',
    description: 'ZRH to MLE with Swiss International.',
    category: 'business', price: 280000,
    origin: 'ZRH', destination: 'MLE',
    airline: 'Swiss', flightNumber: 'LX2082',
    departureDate: new Date('2026-07-10T21:00:00Z'),
    arrivalDate: new Date('2026-07-11T10:30:00Z'),
    totalUnits: 16, availableUnits: 16,
  },
  {
    type: 'flight', title: 'Oslo to Reykjavik Economy',
    description: 'OSL to KEF with Icelandair.',
    category: 'economy', price: 25000,
    origin: 'OSL', destination: 'KEF',
    airline: 'Icelandair', flightNumber: 'FI319',
    departureDate: new Date('2026-08-01T12:00:00Z'),
    arrivalDate: new Date('2026-08-01T13:30:00Z'),
    totalUnits: 130, availableUnits: 130,
  },
  {
    type: 'flight', title: 'Los Angeles to Honolulu Economy',
    description: 'LAX to HNL with Hawaiian Airlines.',
    category: 'economy', price: 35000,
    origin: 'LAX', destination: 'HNL',
    airline: 'Hawaiian Airlines', flightNumber: 'HA5',
    departureDate: new Date('2026-06-25T08:00:00Z'),
    arrivalDate: new Date('2026-06-25T11:00:00Z'),
    totalUnits: 200, availableUnits: 200,
  },

  /* ═══════════════════════════════════════════════════════════
     HOTELS – 26 real-world properties
     ═══════════════════════════════════════════════════════════ */

  // 1. Grand Hyatt Paris
  {
    type: 'hotel', title: 'Grand Hyatt Paris',
    description: 'Five-star luxury with Eiffel Tower views.',
    category: 'luxury', price: 85000,
    location: 'Paris, France',
    checkInDate: new Date('2026-04-01'), checkOutDate: new Date('2026-09-30'),
    amenities: ['wifi', 'pool', 'spa', 'gym', 'restaurant', 'bar'],
    totalUnits: 15, availableUnits: 15,
  },

  // 2. Budget Inn Tokyo
  {
    type: 'hotel', title: 'Budget Inn Downtown Tokyo',
    description: 'Clean capsule-style rooms near Shibuya.',
    category: 'budget', price: 8500,
    location: 'Tokyo, Japan',
    checkInDate: new Date('2026-03-01'), checkOutDate: new Date('2026-12-31'),
    amenities: ['wifi', 'laundry'],
    totalUnits: 50, availableUnits: 50,
  },

  // 3. Marina Bay Sands Singapore
  {
    type: 'hotel', title: 'Marina Bay Sands Singapore',
    description: 'Iconic rooftop infinity pool overlooking the city.',
    category: 'luxury', price: 120000,
    location: 'Singapore',
    checkInDate: new Date('2026-04-01'), checkOutDate: new Date('2026-10-31'),
    amenities: ['wifi', 'pool', 'spa', 'gym', 'casino', 'restaurant'],
    totalUnits: 10, availableUnits: 10,
  },

  // 4. Comfort Suites Orlando
  {
    type: 'hotel', title: 'Comfort Suites Orlando',
    description: 'Family-friendly near Walt Disney World.',
    category: 'standard', price: 22000,
    location: 'Orlando, USA',
    checkInDate: new Date('2026-05-01'), checkOutDate: new Date('2026-08-31'),
    amenities: ['wifi', 'pool', 'breakfast', 'shuttle'],
    totalUnits: 80, availableUnits: 80,
  },

  // 5. The Ritz London
  {
    type: 'hotel', title: 'The Ritz London',
    description: 'Classic British luxury on Piccadilly.',
    category: 'luxury', price: 95000,
    location: 'London, UK',
    checkInDate: new Date('2026-03-15'), checkOutDate: new Date('2026-11-30'),
    amenities: ['wifi', 'spa', 'gym', 'restaurant', 'afternoon-tea'],
    totalUnits: 20, availableUnits: 20,
  },

  // 6. Hostel Wave Bali
  {
    type: 'hotel', title: 'Hostel Wave Bali',
    description: 'Beachfront hostel with surfboard rentals.',
    category: 'budget', price: 3500,
    location: 'Bali, Indonesia',
    checkInDate: new Date('2026-01-01'), checkOutDate: new Date('2026-12-31'),
    amenities: ['wifi', 'surfboards', 'bar'],
    totalUnits: 40, availableUnits: 40,
  },

  // 7. Burj Al Arab Dubai
  {
    type: 'hotel', title: 'Burj Al Arab Dubai',
    description: 'The world-famous sail-shaped tower. All suites.',
    category: 'luxury', price: 250000,
    location: 'Dubai, UAE',
    checkInDate: new Date('2026-03-01'), checkOutDate: new Date('2026-12-31'),
    amenities: ['wifi', 'pool', 'spa', 'gym', 'helipad', 'butler', 'restaurant'],
    totalUnits: 6, availableUnits: 6,
  },

  // 8. Hilton Times Square
  {
    type: 'hotel', title: 'Hilton Times Square New York',
    description: 'Right in the heart of Manhattan.',
    category: 'standard', price: 35000,
    location: 'New York, USA',
    checkInDate: new Date('2026-04-01'), checkOutDate: new Date('2026-10-31'),
    amenities: ['wifi', 'gym', 'restaurant', 'bar'],
    totalUnits: 60, availableUnits: 60,
  },

  // 9. Hotel Negresco Nice
  {
    type: 'hotel', title: 'Hotel Negresco Nice',
    description: 'Belle Epoque landmark on the French Riviera.',
    category: 'luxury', price: 68000,
    location: 'Nice, France',
    checkInDate: new Date('2026-05-01'), checkOutDate: new Date('2026-09-30'),
    amenities: ['wifi', 'beach', 'restaurant', 'bar'],
    totalUnits: 12, availableUnits: 12,
  },

  // 10. Backpackers Inn Sydney
  {
    type: 'hotel', title: 'Backpackers Inn Sydney',
    description: 'Budget-friendly in the CBD near Circular Quay.',
    category: 'budget', price: 6500,
    location: 'Sydney, Australia',
    checkInDate: new Date('2026-01-01'), checkOutDate: new Date('2026-12-31'),
    amenities: ['wifi', 'kitchen', 'laundry'],
    totalUnits: 35, availableUnits: 35,
  },

  // 11. Taj Mahal Palace Mumbai
  {
    type: 'hotel', title: 'Taj Mahal Palace Mumbai',
    description: 'Historic luxury hotel overlooking the Gateway of India.',
    category: 'luxury', price: 55000,
    location: 'Mumbai, India',
    checkInDate: new Date('2026-03-01'), checkOutDate: new Date('2026-12-31'),
    amenities: ['wifi', 'pool', 'spa', 'gym', 'restaurant', 'butler'],
    totalUnits: 25, availableUnits: 25,
  },

  // 12. ibis Bangkok Riverside
  {
    type: 'hotel', title: 'ibis Bangkok Riverside',
    description: 'Modern budget hotel on the Chao Phraya River.',
    category: 'budget', price: 5500,
    location: 'Bangkok, Thailand',
    checkInDate: new Date('2026-01-01'), checkOutDate: new Date('2026-12-31'),
    amenities: ['wifi', 'pool', 'restaurant'],
    totalUnits: 100, availableUnits: 100,
  },

  // 13. Four Seasons Maldives
  {
    type: 'hotel', title: 'Four Seasons Maldives',
    description: 'Overwater bungalows with private reef.',
    category: 'luxury', price: 350000,
    location: 'Maldives',
    checkInDate: new Date('2026-04-01'), checkOutDate: new Date('2026-11-30'),
    amenities: ['wifi', 'pool', 'spa', 'diving', 'snorkeling', 'butler'],
    totalUnits: 8, availableUnits: 8,
  },

  // 14. Holiday Inn Barcelona
  {
    type: 'hotel', title: 'Holiday Inn Barcelona',
    description: 'Standard comfort near La Rambla.',
    category: 'standard', price: 18000,
    location: 'Barcelona, Spain',
    checkInDate: new Date('2026-04-01'), checkOutDate: new Date('2026-10-31'),
    amenities: ['wifi', 'gym', 'restaurant'],
    totalUnits: 45, availableUnits: 45,
  },

  // 15. Aman Tokyo
  {
    type: 'hotel', title: 'Aman Tokyo',
    description: 'Minimalist luxury high-rise in Otemachi.',
    category: 'luxury', price: 180000,
    location: 'Tokyo, Japan',
    checkInDate: new Date('2026-03-01'), checkOutDate: new Date('2026-12-31'),
    amenities: ['wifi', 'spa', 'pool', 'gym', 'restaurant'],
    totalUnits: 10, availableUnits: 10,
  },

  // 16. Generator Hostel Rome
  {
    type: 'hotel', title: 'Generator Hostel Rome',
    description: 'Trendy hostel near Termini Station.',
    category: 'budget', price: 4500,
    location: 'Rome, Italy',
    checkInDate: new Date('2026-01-01'), checkOutDate: new Date('2026-12-31'),
    amenities: ['wifi', 'bar', 'lounge'],
    totalUnits: 60, availableUnits: 60,
  },

  // 17. Fairmont Banff Springs
  {
    type: 'hotel', title: 'Fairmont Banff Springs',
    description: 'Castle-style resort in the Canadian Rockies.',
    category: 'luxury', price: 75000,
    location: 'Banff, Canada',
    checkInDate: new Date('2026-06-01'), checkOutDate: new Date('2026-09-30'),
    amenities: ['wifi', 'pool', 'spa', 'golf', 'ski', 'restaurant'],
    totalUnits: 18, availableUnits: 18,
  },

  // 18. Novotel Istanbul
  {
    type: 'hotel', title: 'Novotel Istanbul Bosphorus',
    description: 'Modern hotel with Bosphorus views.',
    category: 'standard', price: 16000,
    location: 'Istanbul, Turkey',
    checkInDate: new Date('2026-04-01'), checkOutDate: new Date('2026-11-30'),
    amenities: ['wifi', 'pool', 'gym', 'restaurant'],
    totalUnits: 55, availableUnits: 55,
  },

  // 19. Copacabana Palace Rio
  {
    type: 'hotel', title: 'Copacabana Palace Rio de Janeiro',
    description: 'Legendary beachfront hotel on Copacabana.',
    category: 'luxury', price: 62000,
    location: 'Rio de Janeiro, Brazil',
    checkInDate: new Date('2026-04-01'), checkOutDate: new Date('2026-10-31'),
    amenities: ['wifi', 'pool', 'spa', 'beach', 'restaurant', 'bar'],
    totalUnits: 14, availableUnits: 14,
  },

  // 20. Hostel One Prague
  {
    type: 'hotel', title: 'Hostel One Prague',
    description: 'Social hostel in Prague Old Town.',
    category: 'budget', price: 3000,
    location: 'Prague, Czech Republic',
    checkInDate: new Date('2026-01-01'), checkOutDate: new Date('2026-12-31'),
    amenities: ['wifi', 'bar', 'kitchen'],
    totalUnits: 30, availableUnits: 30,
  },

  // 21-26: Additional hotels
  {
    type: 'hotel', title: 'Waldorf Astoria Amsterdam',
    description: 'Canal-side luxury in six 17th-century houses.',
    category: 'luxury', price: 78000,
    location: 'Amsterdam, Netherlands',
    checkInDate: new Date('2026-04-01'), checkOutDate: new Date('2026-10-31'),
    amenities: ['wifi', 'spa', 'gym', 'restaurant', 'bar'],
    totalUnits: 12, availableUnits: 12,
  },
  {
    type: 'hotel', title: 'Lotte Hotel Seoul',
    description: 'Five-star tower in Myeongdong shopping district.',
    category: 'luxury', price: 48000,
    location: 'Seoul, South Korea',
    checkInDate: new Date('2026-03-01'), checkOutDate: new Date('2026-12-31'),
    amenities: ['wifi', 'pool', 'spa', 'gym', 'restaurant'],
    totalUnits: 30, availableUnits: 30,
  },
  {
    type: 'hotel', title: 'Hostel Fish Reykjavik',
    description: 'Cozy budget hostel near Hallgrimskirkja.',
    category: 'budget', price: 7000,
    location: 'Reykjavik, Iceland',
    checkInDate: new Date('2026-05-01'), checkOutDate: new Date('2026-09-30'),
    amenities: ['wifi', 'kitchen', 'lounge'],
    totalUnits: 20, availableUnits: 20,
  },
  {
    type: 'hotel', title: 'Marriott Cancun Resort',
    description: 'All-inclusive beachfront in the Hotel Zone.',
    category: 'standard', price: 28000,
    location: 'Cancun, Mexico',
    checkInDate: new Date('2026-04-01'), checkOutDate: new Date('2026-11-30'),
    amenities: ['wifi', 'pool', 'beach', 'spa', 'all-inclusive'],
    totalUnits: 70, availableUnits: 70,
  },
  {
    type: 'hotel', title: 'Oberoi Udaipur',
    description: 'Lakeside palace resort in Rajasthan.',
    category: 'luxury', price: 65000,
    location: 'Udaipur, India',
    checkInDate: new Date('2026-09-01'), checkOutDate: new Date('2026-03-31'),
    amenities: ['wifi', 'pool', 'spa', 'boat', 'restaurant'],
    totalUnits: 10, availableUnits: 10,
  },
  {
    type: 'hotel', title: 'Park Hyatt Nairobi',
    description: 'Modern luxury overlooking Uhuru Gardens.',
    category: 'luxury', price: 42000,
    location: 'Nairobi, Kenya',
    checkInDate: new Date('2026-03-01'), checkOutDate: new Date('2026-12-31'),
    amenities: ['wifi', 'pool', 'spa', 'gym', 'restaurant'],
    totalUnits: 15, availableUnits: 15,
  },
];

async function seed() {
  try {
    if (!config.mongo.uri) {
      console.error('[Seed] MONGODB_URI is not set. Check your .env file.');
      process.exit(1);
    }

    console.log('[Seed] Connecting to MongoDB...');
    await mongoose.connect(config.mongo.uri, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log('[Seed] Connected to MongoDB');

    await User.deleteMany({});
    await Inventory.deleteMany({});
    await Booking.deleteMany({});
    await Task.deleteMany({});
    await ShareLink.deleteMany({});
    console.log('[Seed] Cleared existing data (users, inventory, bookings, tasks, share links)');

    const createdUsers = await User.create(users);
    console.log(`[Seed] Created ${createdUsers.length} users`);
    console.log('  Admin: admin@booking.com / admin123');
    console.log('  User:  john@example.com  / user123');

    const createdItems = await Inventory.insertMany(inventory);
    const flights = createdItems.filter(i => i.type === 'flight');
    const hotels = createdItems.filter(i => i.type === 'hotel');
    console.log(`[Seed] Created ${createdItems.length} inventory items (${flights.length} flights, ${hotels.length} hotels)`);

    await mongoose.disconnect();
    console.log('[Seed] Done!');
    process.exit(0);
  } catch (err) {
    if (err.name === 'MongooseServerSelectionError') {
      console.error('\n[Seed] ERROR: Cannot connect to MongoDB Atlas.');
      console.error('       This usually means your IP address is not whitelisted.');
      console.error('       Fix: Go to MongoDB Atlas → Network Access → Add Current IP Address');
      console.error('       Or add 0.0.0.0/0 to allow access from anywhere.\n');
    } else {
      console.error('[Seed] Error:', err.message);
    }
    process.exit(1);
  }
}

seed();
