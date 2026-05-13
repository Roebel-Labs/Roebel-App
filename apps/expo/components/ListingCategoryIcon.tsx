import React from 'react';
import { SvgXml } from 'react-native-svg';

type Props = {
  name: string;
  size?: number;
  color?: string;
};

const ICONS: Record<string, string> = {
  'book-03': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M8 2V18" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M20 22H6C4.89543 22 4 21.1046 4 20M4 20C4 18.8954 4.89543 18 6 18H20V6C20 4.11438 20 3.17157 19.4142 2.58579C18.8284 2 17.8856 2 16 2H10C7.17157 2 5.75736 2 4.87868 2.87868C4 3.75736 4 5.17157 4 8V20Z" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M19.5 18C19.5 18 18.5 18.7628 18.5 20C18.5 21.2372 19.5 22 19.5 22" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  'car-03': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M9.00781 17C9.00781 18.1046 8.11238 19 7.00781 19C5.90324 19 5.00781 18.1046 5.00781 17C5.00781 15.8954 5.90324 15 7.00781 15C8.11238 15 9.00781 15.8954 9.00781 17Z" stroke="black" stroke-width="1.5"/>
<path d="M19.0078 17C19.0078 18.1046 18.1124 19 17.0078 19C15.9032 19 15.0078 18.1046 15.0078 17C15.0078 15.8954 15.9032 15 17.0078 15C18.1124 15 19.0078 15.8954 19.0078 17Z" stroke="black" stroke-width="1.5"/>
<path d="M2.00781 10H18.0078M3.64256 5.42C3.16293 6.2 2.22365 8.26 2.00781 10C2.00781 10.78 1.98782 13.04 2.01181 15.26C2.04778 15.98 2.16769 16.58 5.00952 17M9.00781 10V5M14.9979 17H9.00248M2.0238 5H12.24C12.24 5 12.7796 5 13.2592 5.048C14.1586 5.132 14.914 5.54 15.6694 6.56C16.4693 7.64 17.0843 9.008 17.8997 9.74C19.2547 10.9564 21.8327 10.58 21.9766 13.16C22.0126 14.48 22.0126 15.92 21.9526 16.16C21.8563 16.8667 21.3114 16.9821 20.6336 17C20.0454 17.0156 19.3363 16.9721 18.9909 17" stroke="black" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,
  football: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="black" stroke-width="1.5"/>
<path d="M11.7077 9.34893C11.882 9.21702 12.118 9.21702 12.2923 9.34893L14.545 11.054C14.7193 11.1859 14.7922 11.4197 14.7256 11.6332L13.8652 14.3921C13.7986 14.6055 13.6077 14.75 13.3923 14.75H10.6077C10.3923 14.75 10.2014 14.6055 10.1348 14.3921L9.27437 11.6332C9.20781 11.4197 9.28073 11.1859 9.45499 11.054L11.7077 9.34893Z" stroke="black" stroke-width="1.5"/>
<path d="M12 9V5M15 11L19 9.5M14 15L16 18M10 14.5L8 17M9 11.5L5 10.5" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M9 2.5L12.0165 4.62241L15 2.5M2 12.7998L5.19655 10.4388L3.55548 6.72045M19.4703 18.8531L15.6158 18.1555L14.2655 22M20.0298 6.19586L18.8035 9.38978L22 11.7507M8.00992 21.4059L8.05142 17.1665L4.00331 17.21" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`,
  gameboy: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M14.5 6C15.2766 6 15.6649 6 15.9711 6.12687C16.3795 6.29602 16.704 6.62048 16.8731 7.02886C17 7.33515 17 7.72343 17 8.5C17 9.27657 17 9.66485 16.8731 9.97114C16.704 10.3795 16.3795 10.704 15.9711 10.8731C15.6649 11 15.2766 11 14.5 11H9.5C8.72343 11 8.33515 11 8.02886 10.8731C7.62048 10.704 7.29602 10.3795 7.12687 9.97114C7 9.66485 7 9.27657 7 8.5C7 7.72343 7 7.33515 7.12687 7.02886C7.29602 6.62048 7.62048 6.29602 8.02886 6.12687C8.33515 6 8.72343 6 9.5 6H14.5Z" stroke="black" stroke-width="1.5" stroke-linecap="round"/>
<path d="M11 17H9M9 17H7M9 17V19M9 17V15" stroke="black" stroke-width="1.5" stroke-linecap="round"/>
<path d="M17 18V16" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M21 13V11C21 7.25027 21 5.3754 20.0451 4.06107C19.7367 3.6366 19.3634 3.26331 18.9389 2.95491C17.6246 2 15.7497 2 12 2C8.25027 2 6.3754 2 5.06107 2.95491C4.6366 3.26331 4.26331 3.6366 3.95491 4.06107C3 5.3754 3 7.25027 3 11V13C3 16.7497 3 18.6246 3.95491 19.9389C4.26331 20.3634 4.6366 20.7367 5.06107 21.0451C6.3754 22 8.25027 22 12 22C15.7497 22 17.6246 22 18.9389 21.0451C19.3634 20.7367 19.7367 20.3634 20.0451 19.9389C21 18.6246 21 16.7497 21 13Z" stroke="black" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,
  'hand-coins': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M2 18V12C2 11.535 2 11.3025 2.05111 11.1118C2.18981 10.5941 2.59413 10.1898 3.11177 10.0511C3.30252 10 3.53501 10 4 10C4.46499 10 4.69748 10 4.88823 10.0511C5.40587 10.1898 5.81019 10.5941 5.94889 11.1118C6 11.3025 6 11.535 6 12V18C6 18.465 6 18.6975 5.94889 18.8882C5.81019 19.4059 5.40587 19.8102 4.88823 19.9489C4.69748 20 4.46499 20 4 20C3.53501 20 3.30252 20 3.11177 19.9489C2.59413 19.8102 2.18981 19.4059 2.05111 18.8882C2 18.6975 2 18.465 2 18Z" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M6 11H7.76845C8.58101 11 9.38511 11.165 10.132 11.4851L14.8574 13.5103C15.5506 13.8074 16 14.489 16 15.2431C16 15.9373 15.4373 16.5 14.7431 16.5H14.0986C13.3729 16.5 12.6538 16.3615 11.98 16.092L10.5 15.5" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M14 16.5H20.5749C21.362 16.5 22 17.138 22 17.9251C22 18.5613 21.5782 19.1205 20.9664 19.2953L15.7451 20.7871C15.2508 20.9283 14.7392 21 14.2251 21C13.7437 21 13.2645 20.9372 12.7994 20.8132L6 19" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M18 11C20.2091 11 22 9.20914 22 7C22 4.79086 20.2091 3 18 3C15.7909 3 14 4.79086 14 7C14 9.20914 15.7909 11 18 11Z" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  'home-12': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M2 10L11.1076 2.80982C11.3617 2.60915 11.6761 2.5 12 2.5C12.3239 2.5 12.6383 2.60915 12.8924 2.80982L16.5 5.65789V4C16.5 3.44772 16.9477 3 17.5 3H18.5C19.0523 3 19.5 3.44771 19.5 4V8.02632L22 10" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M20 11.5V15.5C20 18.3284 20 19.7426 19.1213 20.6213C18.2426 21.5 16.8284 21.5 14 21.5H10C7.17157 21.5 5.75736 21.5 4.87868 20.6213C4 19.7426 4 18.3284 4 15.5V11.5" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M15.002 15.5C14.2025 16.1224 13.1522 16.5 12.002 16.5C10.8518 16.5 9.80147 16.1224 9.00195 15.5" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  'house-05': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M4 11H20V22H4V11Z" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M14.5 22V19C14.5 18.0572 14.5 17.5858 14.2071 17.2929C13.9142 17 13.4428 17 12.5 17H11.5C10.5572 17 10.0858 17 9.79289 17.2929C9.5 17.5858 9.5 18.0572 9.5 19V22" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M2 9.7226C2 9.14507 2.26952 8.68207 2.81725 8.49903L10.9302 5.78779C11.7893 5.50068 12 5.02556 12 4.18614C12 3.42897 11.8761 1.91736 13.0641 2.00234C13.3438 2.02235 13.6832 2.28698 14.3619 2.81625L21.439 8.3347C21.8381 8.64587 22 9.0172 22 9.53495C22 10.4782 21.6036 11.0001 20.6848 11.0001H3.14677C2.40983 11.0001 2 10.4555 2 9.7226Z" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M3 22H21" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M7 15H8" stroke="black" stroke-width="1.5" stroke-linecap="round"/>
<path d="M17 15H16" stroke="black" stroke-width="1.5" stroke-linecap="round"/>
<path d="M5 7.5V3" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  'lamp-04': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M12 19C12.8284 19 13.5 18.3284 13.5 17.5C13.5 16.6716 12.8284 16 12 16C11.1716 16 10.5 16.6716 10.5 17.5C10.5 18.3284 11.1716 19 12 19Z" stroke="black" stroke-width="1.5"/>
<path d="M12 16V12" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M12 22V19" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M8 22H16" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M15.0259 12H8.9741C6.76217 12 5.65621 12 5.18728 11.3145C4.71834 10.6289 5.17219 9.67558 6.07989 7.7689L7.70343 4.35854C8.24854 3.21351 8.52109 2.64099 9.04548 2.3205C9.56986 2 10.234 2 11.5624 2H12.4376C13.766 2 14.4301 2 14.9545 2.3205C15.4789 2.64099 15.7515 3.21351 16.2966 4.35854L17.9201 7.76891C18.8278 9.67558 19.2817 10.6289 18.8127 11.3145C18.3438 12 17.2378 12 15.0259 12Z" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  'laptop-phone-sync': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M16 13.5001V17.5001C16 18.9143 16 19.6214 16.4393 20.0608C16.8787 20.5001 17.5858 20.5001 19 20.5001C20.4142 20.5001 21.1213 20.5001 21.5606 20.0608C22 19.6214 22 18.9143 22 17.5001V13.5001C22 12.0859 22 11.3788 21.5606 10.9395C21.1213 10.5001 20.4142 10.5001 19 10.5001C17.5858 10.5001 16.8787 10.5001 16.4393 10.9395C16 11.3788 16 12.0859 16 13.5001Z" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M4 16.5005V8.50049C4 6.14347 4 4.96495 4.73266 4.23272C5.46533 3.50049 6.64454 3.50049 9.00295 3.50049H16.0071C18.3655 3.50049 19.5447 3.50049 20.2774 4.23272C20.8347 4.78969 20.968 5.60486 21 7.00049" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M13 20.5005H2.51579C2.13285 20.5005 1.88379 20.1093 2.05505 19.7769L4 16.5005H13" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  'leaf-01': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M7.64584 15.7108C7.23279 14.8966 7 13.9755 7 13C7 9.78484 9.5 7.5 13 7C17.0817 6.4169 18.8333 4.16667 20 3C23.5 16 17 19 13 19C11.9071 19 10.8825 18.7078 10 18.1973" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M3 21C3.5 18 5.45791 16.1355 10 15C13.2167 14.1958 15.4634 12.1791 17 10.0549" stroke="black" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,
  note: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M12.8809 7.01656L17.6538 8.28825M11.8578 10.8134L14.2442 11.4492M11.9765 17.9664L12.9311 18.2208C15.631 18.9401 16.981 19.2998 18.0445 18.6893C19.108 18.0787 19.4698 16.7363 20.1932 14.0516L21.2163 10.2548C21.9398 7.57005 22.3015 6.22768 21.6875 5.17016C21.0735 4.11264 19.7235 3.75295 17.0235 3.03358L16.0689 2.77924C13.369 2.05986 12.019 1.70018 10.9555 2.31074C9.89196 2.9213 9.53023 4.26367 8.80678 6.94841L7.78366 10.7452C7.0602 13.4299 6.69848 14.7723 7.3125 15.8298C7.92652 16.8874 9.27651 17.2471 11.9765 17.9664Z" stroke="black" stroke-width="1.5" stroke-linecap="round"/>
<path d="M12 20.9462L11.0477 21.2055C8.35403 21.939 7.00722 22.3057 5.94619 21.6832C4.88517 21.0607 4.52429 19.692 3.80253 16.9546L2.78182 13.0833C2.06006 10.3459 1.69918 8.97716 2.31177 7.8989C2.84167 6.96617 4 7.00013 5.5 7.00001" stroke="black" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,
  package: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M12 22C11.1818 22 10.4002 21.6698 8.83693 21.0095C4.94564 19.3657 3 18.5438 3 17.1613C3 16.7742 3 10.0645 3 7M12 22C12.8182 22 13.5998 21.6698 15.1631 21.0095C19.0544 19.3657 21 18.5438 21 17.1613V7M12 22V11.3548" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M8.32592 9.69138L5.40472 8.27785C3.80157 7.5021 3 7.11423 3 6.5C3 5.88577 3.80157 5.4979 5.40472 4.72215L8.32592 3.30862C10.1288 2.43621 11.0303 2 12 2C12.9697 2 13.8712 2.4362 15.6741 3.30862L18.5953 4.72215C20.1984 5.4979 21 5.88577 21 6.5C21 7.11423 20.1984 7.5021 18.5953 8.27785L15.6741 9.69138C13.8712 10.5638 12.9697 11 12 11C11.0303 11 10.1288 10.5638 8.32592 9.69138Z" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M6 12L8 13" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M17 4L7 9" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  'running-shoes': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M19.1012 18H7.96299C5.02913 18 3.56221 18 2.66807 16.8828C0.97093 14.7623 2.9047 9.1238 4.07611 7C4.47324 9.4 8.56152 9.33333 10.0507 9C9.05852 7.00119 10.3831 6.33413 11.0453 6.00059L11.0465 6C14 9.5 20.3149 11.404 21.8624 15.2188C22.5309 16.8667 20.6262 18 19.1012 18Z" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M2 14C6.16467 15.4294 8.73097 15.8442 12.0217 14.8039C13.0188 14.4887 13.5174 14.3311 13.8281 14.3525C14.1389 14.3739 14.7729 14.6695 16.0408 15.2608C17.6243 15.9992 19.7971 16.4243 22 15.3583" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M13.5 9.5L15 8" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M15.5 11L17 9.5" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  't-shirt': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M5.99805 12V17.6841C5.99805 19.4952 5.99805 20.4008 6.58334 20.9635C7.24838 21.6028 9.61589 21.9785 11.993 21.9991C14.309 22.0192 16.6342 21.7022 17.4026 20.9635C17.9879 20.4008 17.9879 19.4952 17.9879 17.6841V12" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M5.72228 14.022C4.8566 13.7083 3.22971 13.4394 2.49588 12.7032C1.48592 11.69 2.13864 10.3201 3.37707 7.7389C3.93449 6.57709 5.00094 5.72242 6.24362 5.38451C6.41238 5.33862 6.55884 5.23313 6.65592 5.08754L7.93933 3.08866C7.97639 3.03308 8.02343 2.98532 8.08061 2.95083C8.65909 2.60194 10.0921 1.99997 11.9925 1.99997C13.8929 1.99997 15.2321 2.60194 15.8105 2.95083C15.8677 2.98532 15.9148 3.03308 15.9518 3.08866L17.2721 5.06869C17.3692 5.21428 17.5156 5.31977 17.6844 5.36566C18.9271 5.70357 19.9451 6.45011 20.5026 7.61192C21.8937 10.1413 22.5105 11.6707 21.5005 12.6839C20.7667 13.4201 19.1174 13.7116 18.2517 14.0253" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M6.50195 5.49997L10.7355 8.7926C11.3419 9.26418 11.645 9.49997 12.002 9.49997C12.359 9.49997 12.6621 9.26418 13.2685 8.7926L17.502 5.49997" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M9.50195 2.99997L11.002 8.99997M14.502 2.99997L13.002 8.99997" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  'table-lamp-02': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M5 20V22M19 20V22" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M17.5556 10H6.44444C4.34931 10 3.30175 10 2.65087 10.5858C2 11.1716 2 12.1144 2 14V16C2 17.8856 2 18.8284 2.65087 19.4142C3.30175 20 4.34931 20 6.44444 20H17.5556C19.6507 20 20.6983 20 21.3491 19.4142C22 18.8284 22 17.8856 22 16V14C22 12.1144 22 11.1716 21.3491 10.5858C20.6983 10 19.6507 10 17.5556 10Z" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M12 10.0001V20.0001" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M16 15.0001H17" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M7 15.0001H8" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M8 2C6.1038 2 4.51109 3.27976 4.0638 5.01012C3.8557 5.81516 4.15776 6 4.95386 6H11.0461C11.8422 6 12.1443 5.81516 11.9362 5.01012C11.4889 3.27976 9.8962 2 8 2Z" stroke="black" stroke-width="2" stroke-linejoin="round"/>
<path d="M8 6V10" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M11 6V7.5" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  tools: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M13 11L18 6" stroke="black" stroke-width="1.5"/>
<path d="M19 7L17 5L19.5 3.5L20.5 4.5L19 7Z" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M4.02513 8.97487C3.01416 7.96391 2.75095 6.48836 3.23548 5.23548L4.65748 6.65748H6.65748V4.65748L5.23548 3.23548C6.48836 2.75095 7.96391 3.01416 8.97487 4.02513C9.98621 5.03647 10.2493 6.51274 9.76398 7.76593L16.2341 14.236C17.4873 13.7507 18.9635 14.0138 19.9749 15.0251C20.9858 16.0361 21.2491 17.5116 20.7645 18.7645L19.3425 17.3425H17.3425V19.3425L18.7645 20.7645C17.5116 21.2491 16.0361 20.9858 15.0251 19.9749C14.0145 18.9643 13.7511 17.4895 14.2349 16.2369L7.76312 9.76507C6.51053 10.2489 5.03571 9.98546 4.02513 8.97487Z" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M12.203 14.5L6.59897 20.1041C6.07115 20.6319 5.2154 20.6319 4.68758 20.1041L3.89586 19.3124C3.36805 18.7846 3.36805 17.9288 3.89586 17.401L9.49994 11.7969" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`,
};

export default function ListingCategoryIcon({ name, size = 28, color = '#000000' }: Props) {
  const xml = ICONS[name];
  if (!xml) return null;
  const tinted = xml.replace(/stroke="black"/g, `stroke="${color}"`);
  return <SvgXml xml={tinted} width={size} height={size} />;
}
