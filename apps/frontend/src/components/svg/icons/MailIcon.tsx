import React, { SVGProps } from "react";

const MailIcon: React.FC<SVGProps<SVGSVGElement>> = (props) => {
	return (
		<svg
			{...props}
			width="21"
			height="20"
			viewBox="0 0 21 20"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Mail icon</title>
			<g id="mail" clipPath="url(#clip0_7_307)">
				<path
					id="Vector"
					d="M16.9166 3.33325H3.58329C2.66282 3.33325 1.91663 4.07944 1.91663 4.99992V14.9999C1.91663 15.9204 2.66282 16.6666 3.58329 16.6666H16.9166C17.8371 16.6666 18.5833 15.9204 18.5833 14.9999V4.99992C18.5833 4.07944 17.8371 3.33325 16.9166 3.33325Z"
					stroke="black"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<path
					id="Vector_2"
					d="M18.5833 5.83325L11.1083 10.5833C10.851 10.7444 10.5536 10.8299 10.25 10.8299C9.94636 10.8299 9.6489 10.7444 9.39163 10.5833L1.91663 5.83325"
					stroke="black"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</g>
			<defs>
				<clipPath id="clip0_7_307">
					<rect
						width="20"
						height="20"
						fill="white"
						transform="translate(0.25)"
					/>
				</clipPath>
			</defs>
		</svg>
	);
};

export default MailIcon;
