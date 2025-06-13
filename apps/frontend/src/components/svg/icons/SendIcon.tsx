import React, { SVGProps } from "react";

const SendIcon: React.FC<SVGProps<SVGSVGElement>> = (props) => {
	return (
		<svg
			{...props}
			width="21"
			height="20"
			viewBox="0 0 21 20"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Send icon</title>
			<g id="send 1">
				<path
					id="Vector"
					d="M12.6134 18.0716C12.645 18.1505 12.7001 18.2179 12.7711 18.2646C12.8421 18.3113 12.9258 18.3352 13.0107 18.333C13.0957 18.3308 13.178 18.3027 13.2466 18.2524C13.3151 18.2021 13.3666 18.1321 13.3942 18.0516L18.8109 2.2183C18.8375 2.14446 18.8426 2.06455 18.8255 1.98793C18.8085 1.9113 18.7699 1.84113 18.7144 1.78561C18.6589 1.7301 18.5887 1.69154 18.5121 1.67446C18.4355 1.65737 18.3555 1.66246 18.2817 1.68913L2.44837 7.1058C2.36795 7.13338 2.2979 7.1849 2.2476 7.25344C2.19731 7.32199 2.16918 7.40428 2.16701 7.48926C2.16483 7.57425 2.1887 7.65787 2.23542 7.7289C2.28214 7.79993 2.34947 7.85497 2.42837 7.88663L9.03671 10.5366C9.24561 10.6203 9.43542 10.7453 9.59468 10.9043C9.75394 11.0633 9.87936 11.2529 9.96337 11.4616L12.6134 18.0716Z"
					stroke="#FAFAFA"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<path
					id="Vector_2"
					d="M18.7116 1.78906L9.59497 10.9049"
					stroke="#FAFAFA"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</g>
		</svg>
	);
};

export default SendIcon;
